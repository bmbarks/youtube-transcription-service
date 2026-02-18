import express from 'express';
import logger from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export function createStatusRouter(transcriptionQueue) {
  const router = express.Router();

  /**
   * GET /api/status/:jobId
   * Check the status of a transcription job
   *
   * Response (in progress):
   * {
   *   "jobId": "job_1739883000123_abc123",
   *   "status": "processing",
   *   "progress": 0.45,
   *   "stage": "transcribing (Whisper 45% done)",
   *   "estimatedTimeRemaining": "6 minutes"
   * }
   *
   * Response (complete):
   * {
   *   "jobId": "job_1739883000123_abc123",
   *   "status": "complete",
   *   "videoId": "dQw4w9WgXcQ",
   *   "resultsUrl": "/api/transcript/dQw4w9WgXcQ"
   * }
   *
   * Response (failed):
   * {
   *   "jobId": "job_1739883000123_abc123",
   *   "status": "failed",
   *   "error": "Audio download failed after 3 retries",
   *   "fallbackAttempted": true,
   *   "fallbackStatus": "processing"
   * }
   */
  router.get(
    '/api/status/:jobId',
    asyncHandler(async (req, res) => {
      const { jobId } = req.params;

      if (!jobId || typeof jobId !== 'string') {
        logger.warn('Invalid status request - missing jobId', {
          ip: req.ip,
          jobId,
        });
        return res.status(400).json({
          error: 'Job ID is required',
          code: 'MISSING_JOB_ID',
        });
      }

      try {
        // Get job from queue
        const job = await transcriptionQueue.getJob(jobId);

        if (!job) {
          logger.warn('Job not found', {
            jobId,
            ip: req.ip,
          });
          return res.status(404).json({
            error: 'Job not found',
            code: 'JOB_NOT_FOUND',
            jobId,
          });
        }

        // Get job status and progress
        const state = await job.getState();
        const progress = job.progress();

        // Determine response based on job state
        if (state === 'completed') {
          const result = job.returnvalue;
          return res.json({
            jobId,
            status: 'complete',
            videoId: result.videoId,
            resultsUrl: `/api/transcript/${result.videoId}`,
            completedAt: new Date().toISOString(),
          });
        }

        if (state === 'failed') {
          const error = job.failedReason || 'Unknown error';
          return res.json({
            jobId,
            status: 'failed',
            error,
            attempts: job.attemptsMade,
            maxAttempts: job.opts.attempts,
            failedAt: new Date().toISOString(),
          });
        }

        if (state === 'active' || state === 'processing') {
          // Calculate estimated time remaining
          let stage = 'initializing';
          let estimatedTimeRemaining = 'calculating...';

          if (progress >= 0 && progress < 10) {
            stage = 'downloading video metadata';
          } else if (progress >= 10 && progress < 40) {
            stage = 'attempting YouTube native transcript';
          } else if (progress >= 40 && progress < 50) {
            stage = 'downloading audio from YouTube';
          } else if (progress >= 50 && progress < 90) {
            const remaining = Math.ceil((90 - progress) * 1.5); // Estimate 1.5 min per 10%
            stage = `transcribing with Whisper (${Math.round(progress)}% done)`;
            estimatedTimeRemaining = `~${remaining} minutes`;
          } else if (progress >= 90) {
            stage = 'uploading to storage';
          }

          return res.json({
            jobId,
            status: 'processing',
            state,
            progress,
            stage,
            estimatedTimeRemaining,
          });
        }

        if (state === 'waiting' || state === 'delayed') {
          return res.json({
            jobId,
            status: 'queued',
            state,
            position: await transcriptionQueue.getJobCounts().then(c => c.waiting || 0),
            estimatedWait: '5-15 minutes depending on queue size',
          });
        }

        // Unknown state
        return res.json({
          jobId,
          status: state,
          progress,
        });
      } catch (error) {
        logger.error('Failed to get job status', {
          jobId,
          error: error.message,
          ip: req.ip,
        });

        throw error;
      }
    })
  );

  return router;
}

export default createStatusRouter;
