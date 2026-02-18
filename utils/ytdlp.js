import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger.js';
import { extractVideoId } from './videoId.js';

const execPromise = promisify(exec);

/**
 * Extract YouTube native transcript using yt-dlp
 * Returns transcript data or null if not available
 * Tier 1 - Returns data in <1 second
 */
export async function extractYouTubeTranscript(videoUrl, options = {}) {
  const startTime = Date.now();

  try {
    const videoId = extractVideoId(videoUrl);

    // Build yt-dlp command to extract subtitles
    const args = [
      '--write-subs',
      '--skip-download',
      '--sub-format', 'json3',
      '--sub-langs', 'en',
      '-o', '%(id)s.json3',
      videoUrl,
    ];

    const command = `yt-dlp ${args.join(' ')}`;

    try {
      const { stdout, stderr } = await execPromise(command, {
        timeout: 10000, // 10 second timeout
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      });

      if (stderr && stderr.includes('ERROR')) {
        throw new Error(`yt-dlp error: ${stderr}`);
      }

      // Extract transcript from JSON
      const transcript = parseYouTubeSubtitles(stdout);

      if (!transcript || transcript.length === 0) {
        logger.warn('No transcript found in yt-dlp output', { videoId });
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
      if (error.code === 'ETIMEDOUT') {
        logger.error('yt-dlp timeout - video may be unavailable', {
          videoId,
          error: 'Command timed out after 10 seconds',
        });
      } else {
        logger.error('yt-dlp transcript extraction failed', {
          videoId,
          error: error.message,
          command,
        });
      }
      return null;
    }
  } catch (error) {
    logger.error('Failed to extract YouTube transcript', {
      error: error.message,
    });
    return null;
  }
}

/**
 * Parse YouTube subtitle JSON format
 * Extracts plain text from YouTube's subtitle JSON
 */
function parseYouTubeSubtitles(jsonStr) {
  try {
    // If output is from yt-dlp's JSON subtitle format
    let data;
    
    // Try parsing as JSON (from JSON3 subtitle format)
    try {
      data = JSON.parse(jsonStr);
    } catch {
      // If not JSON, attempt to extract from command output
      const match = jsonStr.match(/\{"events":\[(.*)\]\}/);
      if (match) {
        data = JSON.parse('{' + match[1] + '}');
      } else {
        return [];
      }
    }

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
 * Get video metadata (title, duration, channel) using yt-dlp
 */
export async function getVideoMetadata(videoUrl) {
  try {
    const videoId = extractVideoId(videoUrl);

    const command = `yt-dlp --dump-json --no-warnings ${videoUrl}`;

    const { stdout } = await execPromise(command, {
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
