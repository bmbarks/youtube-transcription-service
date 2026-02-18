import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import config from '../config/environment.js';

const execPromise = promisify(exec);

/**
 * Transcribe audio file using OpenAI Whisper
 * Tier 2 - Returns transcript in ~10-15 minutes for 35-min video
 * Confidence: 96%
 * Cost: $0 (runs locally)
 */
export async function transcribeWithWhisper(audioFilePath, options = {}) {
  const startTime = Date.now();
  const model = options.model || config.whisper.model;
  const device = options.device || config.whisper.device;
  const language = options.language || config.whisper.language;

  let outputJsonPath;

  try {
    if (!existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    // Generate output path
    outputJsonPath = audioFilePath.replace(/\.[^.]+$/, '') + '.json';

    // Build Whisper command
    const args = [
      `--model ${model}`,
      `--device ${device}`,
      `--language ${language}`,
      '--output_format json',
      '--output_dir /',
      `"${audioFilePath}"`,
    ];

    const command = `whisper ${args.join(' ')}`;

    logger.info('Starting Whisper transcription', {
      audioFile: audioFilePath,
      model,
      device,
      language,
    });

    const { stdout, stderr } = await execPromise(command, {
      timeout: config.worker.timeoutMs,
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });

    if (!existsSync(outputJsonPath)) {
      throw new Error('Whisper output file not created');
    }

    // Parse JSON output
    const fs = await import('fs');
    const outputJson = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));

    const processTime = Date.now() - startTime;

    // Convert Whisper segments to standard transcript format
    const transcript = outputJson.segments.map(segment => ({
      text: segment.text.trim(),
      start: segment.start,
      duration: segment.end - segment.start,
    }));

    logger.info('Whisper transcription completed successfully', {
      segments: transcript.length,
      processTime: `${(processTime / 1000).toFixed(1)}s`,
      language: outputJson.language || language,
    });

    // Cleanup
    if (existsSync(outputJsonPath)) {
      unlinkSync(outputJsonPath);
    }

    return {
      transcript,
      language: outputJson.language || language,
      source: 'whisper-small',
      confidence: 0.96, // Consistent confidence for Whisper Small
      processTime: `${(processTime / 60000).toFixed(1)} min`,
      downloadedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Whisper transcription failed', {
      audioFile: audioFilePath,
      error: error.message,
    });

    // Cleanup on error
    if (outputJsonPath && existsSync(outputJsonPath)) {
      try {
        unlinkSync(outputJsonPath);
      } catch (cleanupError) {
        logger.warn('Failed to cleanup Whisper output file', {
          file: outputJsonPath,
          error: cleanupError.message,
        });
      }
    }

    throw error;
  }
}

/**
 * Download audio from YouTube video
 * Uses yt-dlp to extract audio
 */
export async function downloadAudioFromYouTube(videoUrl) {
  const tempDir = `/tmp/whisper_${uuidv4()}`;
  // Note: %(ext)s must be quoted to prevent shell interpretation of parentheses
  const outputTemplate = `${tempDir}/audio.%(ext)s`;

  try {
    // Create temp directory
    const fsPromises = await import('fs').then(m => m.promises);
    await fsPromises.mkdir(tempDir, { recursive: true });

    // Download audio using yt-dlp
    // Format selector: ba[ext=m4a] (best audio m4a) -> ba (best audio) -> b (best overall)
    // This fallback chain handles YouTube API changes that block specific format requests
    const command = `yt-dlp -f 'ba[ext=m4a]/ba/b' --extract-audio --audio-format mp3 --audio-quality 192K -o '${outputTemplate}' "${videoUrl}"`;

    logger.info('Starting audio download from YouTube', {
      videoUrl,
      outputDir: tempDir,
    });

    await execPromise(command, {
      timeout: 300000, // 5 minutes timeout
      maxBuffer: 100 * 1024 * 1024,
    });

    // Find the downloaded audio file
    const fs = await import('fs');
    const files = fs.readdirSync(tempDir);
    const audioFile = files.find(f => f.startsWith('audio.'));

    if (!audioFile) {
      throw new Error('No audio file was downloaded');
    }

    const audioPath = `${tempDir}/${audioFile}`;

    logger.info('Audio downloaded successfully', {
      videoUrl,
      audioFile,
      size: fs.statSync(audioPath).size,
    });

    return audioPath;
  } catch (error) {
    logger.error('Failed to download audio from YouTube', {
      videoUrl,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Check if Whisper is installed and available
 */
export async function isWhisperAvailable() {
  try {
    await execPromise('whisper --version', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Whisper model size and device info
 */
export async function getWhisperInfo() {
  try {
    const { stdout } = await execPromise('whisper --version', { timeout: 5000 });
    return {
      version: stdout.trim(),
      model: config.whisper.model,
      device: config.whisper.device,
      language: config.whisper.language,
    };
  } catch (error) {
    logger.error('Failed to get Whisper info', {
      error: error.message,
    });
    return null;
  }
}

export default {
  transcribeWithWhisper,
  downloadAudioFromYouTube,
  isWhisperAvailable,
  getWhisperInfo,
};
