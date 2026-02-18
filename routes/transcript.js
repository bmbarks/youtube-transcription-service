import express from 'express';
import logger from '../utils/logger.js';
import { isValidVideoId } from '../utils/videoId.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * In-memory cache for completed transcriptions
 * In production, use Redis or database
 */
const transcriptCache = new Map();

export function createTranscriptRouter(transcriptionQueue) {
  const router = express.Router();

  /**
   * GET /api/transcript/:videoId
   * Fetch complete transcription result
   *
   * Response:
   * {
   *   "jobId": "job_1739883000123_abc123",
   *   "videoId": "dQw4w9WgXcQ",
   *   "title": "Rick Astley - Never Gonna Give You Up",
   *   "channel": "Rick Astley",
   *   "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
   *   "source": "youtube-native",
   *   "confidence": 0.98,
   *   "processTime": "0.8 seconds",
   *   "transcriptUrl": "https://barkstech-media.nyc3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.txt",
   *   "transcriptJsonUrl": "https://barkstech-media.nyc3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.json",
   *   "metadata": {
   *     "duration": "3:33",
   *     "language": "en",
   *     "downloadedAt": "2026-02-18T08:50:00Z",
   *     "tier": 1
   *   }
   * }
   */
  router.get(
    '/api/transcript/:videoId',
    asyncHandler(async (req, res) => {
      const { videoId } = req.params;

      if (!isValidVideoId(videoId)) {
        logger.warn('Invalid transcript request - invalid video ID', {
          videoId,
          ip: req.ip,
        });
        return res.status(400).json({
          error: 'Invalid video ID format',
          code: 'INVALID_VIDEO_ID',
        });
      }

      try {
        // Check cache first
        if (transcriptCache.has(videoId)) {
          logger.debug('Serving transcript from cache', {
            videoId,
          });
          return res.json(transcriptCache.get(videoId));
        }

        // Search for completed job with this videoId
        const allJobs = await transcriptionQueue.getJobs(
          ['completed', 'failed'],
          0,
          -1
        );

        let foundJob = null;
        for (const job of allJobs) {
          if (job.returnvalue && job.returnvalue.videoId === videoId && job.returnvalue.transcriptUrl) {
            foundJob = job;
            break;
          }
        }

        if (!foundJob) {
          logger.warn('Transcript not found', {
            videoId,
            ip: req.ip,
          });
          return res.status(404).json({
            error: 'Transcript not found for this video ID',
            code: 'TRANSCRIPT_NOT_FOUND',
            videoId,
            hint: 'Submit a new transcription job via POST /api/transcribe',
          });
        }

        const result = foundJob.returnvalue;

        // Cache the result
        transcriptCache.set(videoId, result);

        logger.info('Transcript retrieved successfully', {
          videoId,
          source: result.source,
          ip: req.ip,
        });

        res.json(result);
      } catch (error) {
        logger.error('Failed to retrieve transcript', {
          videoId,
          error: error.message,
          ip: req.ip,
        });

        throw error;
      }
    })
  );

  return router;
}

export default createTranscriptRouter;
