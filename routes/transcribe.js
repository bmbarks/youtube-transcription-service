import express from 'express';
import logger from '../utils/logger.js';
import { extractVideoId } from '../utils/videoId.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { transcribeRateLimiter } from '../middleware/rateLimit.js';

export function createTranscribeRouter(transcriptionQueue) {
  const router = express.Router();

  /**
   * POST /api/transcribe
   * Submit a new transcription job
   *
   * Request body:
   * {
   *   "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
   *   "forceWhisper": false (optional)
   * }
   *
   * Response:
   * {
   *   "jobId": "job_1739883000123_abc123",
   *   "videoId": "dQw4w9WgXcQ",
   *   "status": "queued",
   *   "estimatedWait": "2 minutes (if Tier 2)",
   *   "tier": "1 (YouTube native) or 2 (Whisper fallback)"
   * }
   */
  router.post(
    '/api/transcribe',
    transcribeRateLimiter,
    asyncHandler(async (req, res) => {
      const { url, forceWhisper = false } = req.body;

      // Validate input
      if (!url || typeof url !== 'string') {
        logger.warn('Invalid transcribe request - missing or invalid URL', {
          ip: req.ip,
          body: req.body,
        });
        return res.status(400).json({
          error: 'URL is required and must be a string',
          code: 'INVALID_URL',
        });
      }

      try {
        // Extract and validate video ID
        const videoId = extractVideoId(url);

        logger.info('Transcription request received', {
          videoId,
          url,
          forceWhisper,
          ip: req.ip,
        });

        // Add job to queue
        const job = await transcriptionQueue.addTranscriptionJob(url, {
          forceWhisper,
        });

        res.status(202).json({
          jobId: job.id,
          videoId,
          status: 'queued',
          estimatedWait: forceWhisper
            ? '10-15 minutes (Whisper)'
            : 'varies (YouTube native ~<1s, fallback ~12min)',
          tier: forceWhisper ? 2 : 'auto (1 → 2)',
          statusUrl: `/api/status/${job.id}`,
        });
      } catch (error) {
        logger.error('Failed to submit transcription job', {
          url,
          error: error.message,
          ip: req.ip,
        });

        if (error.message.includes('Could not extract video ID')) {
          return res.status(400).json({
            error: 'Invalid YouTube URL',
            code: 'INVALID_YOUTUBE_URL',
          });
        }

        throw error;
      }
    })
  );

  return router;
}

export default createTranscribeRouter;
