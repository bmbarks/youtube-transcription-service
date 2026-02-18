import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, unlinkSync, readdirSync } from 'fs';
import logger from './logger.js';
import { extractVideoId } from './videoId.js';
import { executeYtdlp, getCookieArgs, parseBotDetectionError } from '../lib/youtube-downloader.js';

const execPromise = promisify(exec);

/**
 * Extract YouTube native transcript using yt-dlp with cookie support
 * Returns transcript data or null if not available
 * Tier 1 - Returns data in <1 second
 */
export async function extractYouTubeTranscript(videoUrl, options = {}) {
  const startTime = Date.now();
  const workDir = `/tmp/yt_subs_${Date.now()}`;

  try {
    const videoId = extractVideoId(videoUrl);

    // Create temp directory for subtitle files
    const fsPromises = await import('fs').then(m => m.promises);
    await fsPromises.mkdir(workDir, { recursive: true });

    // Build yt-dlp command to extract subtitles
    // Write subs to temp directory, then read the file
    const args = [
      '--write-subs',
      '--write-auto-subs', // Also try auto-generated captions
      '--skip-download',
      '--sub-format', 'json3',
      '--sub-langs', 'en,en-US,en-GB,en.*', // Try various English variants
      '-o', `"${workDir}/%(id)s.%(ext)s"`,
      `"${videoUrl}"`,
    ];

    try {
      const { stdout, stderr } = await executeYtdlp(args, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 50 * 1024 * 1024,
      });

      // Find the subtitle file
      const files = readdirSync(workDir);
      const subFile = files.find(f => f.endsWith('.json3') || f.endsWith('.en.json3'));
      
      if (!subFile) {
        logger.warn('No subtitle file found in output', { videoId, files, workDir });
        // Cleanup
        await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
        return null;
      }

      // Read and parse the subtitle file
      const subPath = `${workDir}/${subFile}`;
      const subContent = readFileSync(subPath, 'utf-8');
      const transcript = parseYouTubeSubtitles(subContent);

      // Cleanup
      await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});

      if (!transcript || transcript.length === 0) {
        logger.warn('No transcript parsed from subtitle file', { videoId, subFile });
        return null;
      }

      const processTime = Date.now() - startTime;

      logger.info('YouTube transcript extracted successfully', {
        videoId,
        lines: transcript.length,
        processTime: `${processTime}ms`,
        source: 'youtube-native',
      });

      return {
        videoId,
        transcript,
        language: 'en',
        source: 'youtube-native',
        confidence: 0.98, // High confidence for official captions
        processTime: processTime < 1000 ? '<1 sec' : `${(processTime / 1000).toFixed(1)} sec`,
        downloadedAt: new Date().toISOString(),
      };
    } catch (error) {
      // Cleanup on error
      await fsPromises.rm(workDir, { recursive: true, force: true }).catch(() => {});
      
      // Check if this is a bot detection / cookies issue
      if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
        logger.error('Bot detection during transcript extraction', {
          videoId,
          code: error.code,
          message: error.message,
        });
        // Re-throw with enriched info - let worker handle it
        throw error;
      }

      if (error.code === 'ETIMEDOUT') {
        logger.error('yt-dlp timeout - video may be unavailable', {
          videoId,
          error: 'Command timed out after 30 seconds',
        });
      } else {
        logger.error('yt-dlp transcript extraction failed', {
          videoId,
          error: error.message,
        });
      }
      return null;
    }
  } catch (error) {
    // If it's a bot detection error, rethrow
    if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
      throw error;
    }
    
    logger.error('Failed to extract YouTube transcript', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Parse YouTube subtitle JSON format
 * Extracts plain text from YouTube's subtitle JSON (JSON3 format)
 */
function parseYouTubeSubtitles(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);

    if (!data.events) {
      return [];
    }

    const transcript = [];
    for (const event of data.events) {
      if (event.segs) {
        let text = '';
        for (const seg of event.segs) {
          text += seg.utf8 || '';
        }
        if (text.trim()) {
          transcript.push({
            text: text.trim(),
            start: event.tStartMs ? event.tStartMs / 1000 : 0,
            duration: event.dDurationMs ? event.dDurationMs / 1000 : 0,
          });
        }
      }
    }

    return transcript;
  } catch (error) {
    logger.error('Failed to parse YouTube subtitle JSON', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Get video metadata (title, duration, channel) using yt-dlp with cookies
 */
export async function getVideoMetadata(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);

    const args = [
      '--dump-json',
      '--no-warnings',
      `"${videoUrl}"`,
    ];

    const { stdout } = await executeYtdlp(args, {
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const metadata = JSON.parse(stdout);

    return {
      videoId,
      title: metadata.title || 'Unknown',
      channel: metadata.uploader || 'Unknown',
      duration: metadata.duration ? formatDuration(metadata.duration) : 'Unknown',
      url: metadata.webpage_url || videoUrl,
    };
  } catch (error) {
    // If bot detection, rethrow
    if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
      throw error;
    }
    
    logger.error('Failed to get video metadata', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Format seconds into HH:MM:SS format
 */
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Check if yt-dlp is installed
 */
export async function isYtdlpAvailable() {
  try {
    await execPromise('yt-dlp --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export default {
  extractYouTubeTranscript,
  getVideoMetadata,
  isYtdlpAvailable,
};
