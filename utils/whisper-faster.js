import { exec } from 'child_process';
import { promisify } from 'util';
import { unlinkSync, existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger.js';
import config from '../config/environment.js';

const execPromise = promisify(exec);

/**
 * Transcribe audio file using faster-whisper
 * Uses CTranslate2 backend - 4x faster than OpenAI whisper, same accuracy
 * Tier 2 - Returns transcript in ~3-5 minutes for 35-min video (vs 10-15 min)
 * Confidence: 96%
 * Cost: $0 (runs locally)
 */
export async function transcribeWithWhisper(audioFilePath, options = {}) {
  const startTime = Date.now();
  const model = options.model || config.whisper.model;
  const device = options.device || config.whisper.device;
  const language = options.language || config.whisper.language;

  let outputDir;

  try {
    if (!existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    // Create output directory for faster-whisper
    outputDir = `/tmp/whisper_out_${uuidv4()}`;
    const fsPromises = await import('fs').then(m => m.promises);
    await fsPromises.mkdir(outputDir, { recursive: true });

    // Build faster-whisper command
    // faster-whisper CLI: faster-whisper <audio> --model <model> --output_format json
    const command = `python3 -c "
from faster_whisper import WhisperModel
import json
import sys

model = WhisperModel('${model}', device='${device}', compute_type='int8')
segments, info = model.transcribe('${audioFilePath}', language='${language}')

result = {
    'language': info.language,
    'segments': []
}

for segment in segments:
    result['segments'].append({
        'start': segment.start,
        'end': segment.end,
        'text': segment.text.strip()
    })

print(json.dumps(result))
"`;

    logger.info('Starting faster-whisper transcription', {
      audioFile: audioFilePath,
      model,
      device,
      language,
    });

    const { stdout, stderr } = await execPromise(command, {
      timeout: config.worker.timeoutMs,
      maxBuffer: 100 * 1024 * 1024, // 100MB buffer
    });

    // Parse JSON output
    const outputJson = JSON.parse(stdout.trim());
    const processTime = Date.now() - startTime;

    // Convert segments to standard transcript format
    const transcript = outputJson.segments.map(segment => ({
      text: segment.text,
      start: segment.start,
      duration: segment.end - segment.start,
    }));

    logger.info('faster-whisper transcription completed successfully', {
      segments: transcript.length,
      processTime: `${(processTime / 1000).toFixed(1)}s`,
      language: outputJson.language || language,
    });

    return {
      transcript,
      language: outputJson.language || language,
      source: `faster-whisper-${model}`,
      confidence: 0.96, // Consistent confidence for Whisper
      processTime: `${(processTime / 60000).toFixed(1)} min`,
      downloadedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('faster-whisper transcription failed', {
      audioFile: audioFilePath,
      error: error.message,
    });

    throw error;
  }
}

/**
 * Download audio from YouTube video
 * Uses yt-dlp to extract audio
 */
export async function downloadAudioFromYouTube(videoUrl) {
  const tempDir = `/tmp/whisper_${uuidv4()}`;
  const outputTemplate = `${tempDir}/audio.%(ext)s`;

  try {
    // Create temp directory
    const fsPromises = await import('fs').then(m => m.promises);
    await fsPromises.mkdir(tempDir, { recursive: true });

    // Download audio using yt-dlp
    const command = `yt-dlp -f bestaudio --extract-audio --audio-format mp3 --audio-quality 192K -o "${outputTemplate}" "${videoUrl}"`;

    logger.info('Starting audio download from YouTube', {
      videoUrl,
      outputDir: tempDir,
    });

    await execPromise(command, {
      timeout: 300000, // 5 minutes timeout
      maxBuffer: 100 * 1024 * 1024,
    });

    // Find the downloaded audio file
    const files = readdirSync(tempDir);
    const audioFile = files.find(f => f.startsWith('audio.'));

    if (!audioFile) {
      throw new Error('No audio file was downloaded');
    }

    const audioPath = `${tempDir}/${audioFile}`;

    logger.info('Audio downloaded successfully', {
      videoUrl,
      audioFile,
      size: statSync(audioPath).size,
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
 * Check if faster-whisper is installed and available
 */
export async function isWhisperAvailable() {
  try {
    await execPromise('python3 -c "from faster_whisper import WhisperModel"', { timeout: 10000 });
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
    const { stdout } = await execPromise('pip3 show faster-whisper | grep Version', { timeout: 5000 });
    return {
      version: stdout.trim(),
      backend: 'faster-whisper (CTranslate2)',
      model: config.whisper.model,
      device: config.whisper.device,
      language: config.whisper.language,
    };
  } catch (error) {
    logger.error('Failed to get faster-whisper info', {
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
