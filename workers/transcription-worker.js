import Queue from 'bull';
import config from '../config/environment.js';
import logger from '../utils/logger.js';
import { extractYouTubeTranscript, getVideoMetadata } from '../utils/ytdlp.js';
// Using faster-whisper (CTranslate2) for 4x speed + 10x smaller Docker image
import { transcribeWithWhisper, downloadAudioFromYouTube } from '../utils/whisper-faster.js';
import { uploadTranscript, getTranscriptUrl } from '../utils/spaces.js';
import { extractVideoId } from '../utils/videoId.js';

/**
 * Build Redis configuration for Bull queue
 * Handles both plain redis:// and TLS rediss:// URLs
 */
function buildRedisConfig(redisUrl) {
  // For TLS connections (rediss://), we need explicit config
  // Bull's internal ioredis doesn't auto-configure TLS for all connections
  if (redisUrl.startsWith('rediss://')) {
    const url = new URL(redisUrl);
    logger.info('Configuring Bull with TLS Redis connection', {
      host: url.hostname,
      port: url.port || 25061,
    });
    return {
      port: parseInt(url.port, 10) || 25061,
      host: url.hostname,
      password: url.password || undefined,
      username: url.username || 'default',
      tls: {
        rejectUnauthorized: false, // Required for DO managed databases (self-signed certs)
      },
      maxRetriesPerRequest: null, // Required for Bull v4+ with blocking connections
      enableReadyCheck: false, // Faster connection, skip CLUSTER check
    };
  }
  
  // Plain redis:// URL - use as-is
  return redisUrl;
}

/**
 * Create Bull queue for transcription jobs
 * Persisted to Redis with automatic recovery
 */
export function createTranscriptionQueue() {
  const redisConfig = buildRedisConfig(config.redis.url);
  
  const transcriptionQueue = new Queue('transcription', {
    redis: redisConfig,
    settings: {
      maxStalledCount: 2,
      lockDuration: 30000, // 30s lock duration
      lockRenewTime: 15000, // Renew every 15s
      maxRetriesPerJob: config.worker.maxAttempts,
      retryProcessDelay: 5000, // 5s between retries
    },
  });

  /**
   * Process transcription jobs
   * Implements 3-tier architecture:
   * 1. Try YouTube native transcript
   * 2. Fall back to Whisper if Tier 1 fails
   * 3. Allow user override with forceWhisper flag
   * 
   * V1.1 - Cookie injection for bot detection bypass
   */
  transcriptionQueue.process(config.worker.concurrency, async job => {
    const { url, forceWhisper = false } = job.data;
    const jobId = job.id;

    try {
      const videoId = extractVideoId(url);
      logger.info('Processing transcription job', {
        jobId,
        videoId,
        forceWhisper,
      });

      // Get video metadata first
      let metadata;
      try {
        metadata = await getVideoMetadata(url);
        if (!metadata) {
          throw new Error('Could not fetch video metadata');
        }
      } catch (error) {
        // Handle bot detection during metadata fetch
        if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
          logger.error('Bot detection during metadata fetch', {
            jobId,
            videoId,
            code: error.code,
            message: error.message,
          });
          throw new Error(`${error.code}: ${error.message}. Please refresh YouTube cookies.`);
        }
        throw error;
      }

      // Update job progress
      job.progress(5);

      let result;

      // Tier 1: Try YouTube native transcript (unless forceWhisper)
      if (config.features.enableYoutubeTier && !forceWhisper) {
        logger.info('Attempting Tier 1: YouTube native transcript', { jobId, videoId });

        try {
          const youtubeTranscript = await extractYouTubeTranscript(url);

          if (youtubeTranscript && youtubeTranscript.transcript.length > 0) {
            logger.info('Tier 1 success: YouTube transcript found', {
              jobId,
              videoId,
              lines: youtubeTranscript.transcript.length,
            });

            job.progress(50);

            // Upload to Spaces
            const plainTextTranscript = youtubeTranscript.transcript
              .map(s => s.text)
              .join('\n');

            const transcriptUrl = await uploadTranscript(
              videoId,
              'transcript.txt',
              plainTextTranscript,
              'text/plain'
            );

            const transcriptJsonUrl = await uploadTranscript(
              videoId,
              'transcript.json',
              JSON.stringify(youtubeTranscript.transcript, null, 2),
              'application/json'
            );

            result = {
              jobId,
              videoId,
              title: metadata.title,
              channel: metadata.channel,
              url: metadata.url,
              source: 'youtube-native',
              confidence: youtubeTranscript.confidence,
              processTime: youtubeTranscript.processTime,
              transcriptUrl,
              transcriptJsonUrl,
              metadata: {
                duration: metadata.duration,
                language: youtubeTranscript.language,
                downloadedAt: youtubeTranscript.downloadedAt,
                tier: 1,
              },
            };

            job.progress(100);
            return result;
          } else {
            logger.info('Tier 1 failed: No YouTube transcript found', {
              jobId,
              videoId,
            });
          }
        } catch (error) {
          // Handle bot detection during transcript extraction
          if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
            logger.error('Bot detection during Tier 1 transcript extraction', {
              jobId,
              videoId,
              code: error.code,
            });
            // Don't throw yet - fall through to Tier 2 which might work
            logger.info('Attempting Tier 2 fallback after bot detection', { jobId, videoId });
          } else {
            logger.warn('Tier 1 extraction error (non-fatal)', {
              jobId,
              videoId,
              error: error.message,
            });
          }
        }
      }

      // Tier 2: Fall back to Whisper
      if (!config.features.enableWhisperTier) {
        throw new Error('Whisper Tier is disabled and YouTube transcript not available');
      }

      logger.info('Falling back to Tier 2: Whisper transcription', { jobId, videoId });
      job.progress(10);

      // Download audio
      try {
        logger.info('Downloading audio from YouTube', { jobId, videoId });
        const audioPath = await downloadAudioFromYouTube(url);
        job.progress(40);

        // Transcribe with Whisper
        logger.info('Running Whisper transcription', { jobId, videoId });
        const whisperResult = await transcribeWithWhisper(audioPath);
        job.progress(90);

        // Upload to Spaces
        const plainTextTranscript = whisperResult.transcript
          .map(s => s.text)
          .join('\n');

        const transcriptUrl = await uploadTranscript(
          videoId,
          'transcript.txt',
          plainTextTranscript,
          'text/plain'
        );

        const transcriptJsonUrl = await uploadTranscript(
          videoId,
          'transcript.json',
          JSON.stringify(whisperResult.transcript, null, 2),
          'application/json'
        );

        result = {
          jobId,
          videoId,
          title: metadata.title,
          channel: metadata.channel,
          url: metadata.url,
          source: 'whisper-small',
          confidence: whisperResult.confidence,
          processTime: whisperResult.processTime,
          transcriptUrl,
          transcriptJsonUrl,
          metadata: {
            duration: metadata.duration,
            language: whisperResult.language,
            downloadedAt: whisperResult.downloadedAt,
            tier: 2,
          },
        };

        logger.info('Tier 2 transcription completed successfully', {
          jobId,
          videoId,
          confidence: result.confidence,
          processTime: result.processTime,
        });

        job.progress(100);
        return result;
      } catch (error) {
        // Handle bot detection during audio download
        if (error.code === 'BOT_DETECTION' || error.code === 'COOKIES_EXPIRED') {
          logger.error('Bot detection during Tier 2 audio download', {
            jobId,
            videoId,
            code: error.code,
            message: error.message,
          });
          throw new Error(`${error.code}: ${error.message}`);
        }
        throw error;
      }
    } catch (error) {
      logger.error('Job processing failed', {
        jobId,
        error: error.message,
        stack: error.stack,
      });

      throw error; // Rethrow to trigger Bull retry logic
    }
  });

  /**
   * Job completion handler
   */
  transcriptionQueue.on('completed', job => {
    logger.info('Transcription job completed', {
      jobId: job.id,
      result: job.returnvalue,
    });
  });

  /**
   * Job failure handler
   */
  transcriptionQueue.on('failed', (job, error) => {
    // Check if it was a bot detection failure
    const isBotDetection = error.message && (
      error.message.includes('BOT_DETECTION') || 
      error.message.includes('COOKIES_EXPIRED')
    );
    
    logger.error('Transcription job failed after retries', {
      jobId: job.id,
      attempts: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      error: error.message,
      isBotDetection,
      recommendation: isBotDetection 
        ? 'Refresh YouTube cookies from Chrome browser' 
        : 'Check video availability or server logs',
    });
  });

  /**
   * Job stalled handler
   */
  transcriptionQueue.on('stalled', job => {
    logger.warn('Transcription job stalled', {
      jobId: job.id,
    });
  });

  /**
   * Redis connection error handler
   * Critical for debugging TLS/connection issues in production
   */
  transcriptionQueue.on('error', error => {
    logger.error('Bull queue error (likely Redis connection issue)', {
      error: error.message,
      stack: error.stack,
      code: error.code,
    });
  });

  /**
   * Queue ready handler - confirms worker is listening
   */
  transcriptionQueue.on('ready', () => {
    logger.info('Bull queue ready - worker is now processing jobs', {
      concurrency: config.worker.concurrency,
    });
  });

  /**
   * Get queue health info
   */
  transcriptionQueue.getQueueHealth = async () => {
    const counts = await transcriptionQueue.getJobCounts();
    return {
      queue: 'transcription',
      ...counts,
      workers: config.worker.concurrency,
    };
  };

  /**
   * Add transcription job to queue
   */
  transcriptionQueue.addTranscriptionJob = async (url, options = {}) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job = await transcriptionQueue.add(
      {
        url,
        forceWhisper: options.forceWhisper || false,
      },
      {
        jobId,
        attempts: config.worker.maxAttempts,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: Math.floor(config.worker.jobRemovalDelayMs / 1000), // Convert to seconds
        },
        removeOnFail: false,
      }
    );

    logger.info('Transcription job queued', {
      jobId,
      url,
      estimatedWait: config.worker.concurrency === 1 ? '10-15 minutes' : 'variable',
    });

    return job;
  };

  return transcriptionQueue;
}

export default createTranscriptionQueue;
