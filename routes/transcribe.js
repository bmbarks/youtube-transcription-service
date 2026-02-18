import express from 'express';
import logger from '../utils/logger.js';
import { extractVideoId } from '../utils/videoId.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { transcribeRateLimiter } from '../middleware/rateLimit.js';
import { getCookieHealth } from '../lib/youtube-downloader.js';

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
   *   "tier": "1 (YouTube native) or 2 (Whisper fallback)",
   *   "cookieStatus": "fresh|stale|critical|missing"
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
        
        // Get cookie status for response
        const cookieHealth = getCookieHealth();
        const cookieStatus = cookieHealth.cookies.status;

        logger.info('Transcription request received', {
          videoId,
          url,
          forceWhisper,
          ip: req.ip,
          cookieStatus,
        });

        // Add job to queue
        const job = await transcriptionQueue.addTranscriptionJob(url, {
          forceWhisper,
        });

        // Build response with cookie status warning if needed
        const response = {
          jobId: job.id,
          videoId,
          status: 'queued',
          estimatedWait: forceWhisper
            ? '10-15 minutes (Whisper)'
            : 'varies (YouTube native ~<1s, fallback ~12min)',
          tier: forceWhisper ? 2 : 'auto (1 → 2)',
          statusUrl: `/api/status/${job.id}`,
          cookieStatus,
        };

        // Add warning if cookies are stale or critical
        if (cookieStatus === 'stale') {
          response.warning = 'Cookies are getting old - refresh soon to avoid bot detection';
        } else if (cookieStatus === 'critical') {
          response.warning = 'Cookies are likely expired - may encounter bot detection';
        } else if (cookieStatus === 'missing' || cookieStatus === 'invalid') {
          response.warning = 'No valid cookies - bot detection likely. Contact admin.';
        }

        res.status(202).json(response);
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

  /**
   * GET /api/cookie-status
   * Check cookie health status (for monitoring/debugging)
   */
  router.get(
    '/api/cookie-status',
    asyncHandler(async (req, res) => {
      const cookieHealth = getCookieHealth();
      
      res.json({
        ...cookieHealth,
        recommendation: getRecommendation(cookieHealth.cookies.status),
      });
    })
  );

  return router;
}

/**
 * Get human-readable recommendation based on cookie status
 */
function getRecommendation(status) {
  switch (status) {
    case 'fresh':
      return '✅ Cookies are fresh and working. No action needed.';
    case 'stale':
      return '⚠️ Cookies are getting old. Consider refreshing within 24-48 hours.';
    case 'critical':
      return '🚨 Cookies are likely expired. Refresh immediately to avoid failures.';
    case 'missing':
      return '❌ No cookie file found. Export cookies from Chrome using EditThisCookie extension.';
    case 'invalid':
      return '❌ Cookie file is invalid or corrupted. Re-export from Chrome.';
    case 'error':
      return '❌ Error reading cookie file. Check file permissions.';
    default:
      return '❓ Unknown status. Check server logs.';
  }
}

export default createTranscribeRouter;
