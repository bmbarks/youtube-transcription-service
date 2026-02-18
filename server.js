import express from 'express';
import cors from 'cors';
import config from './config/environment.js';
import logger from './utils/logger.js';
import { authMiddleware, optionalAuthMiddleware } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { globalRateLimiter } from './middleware/rateLimit.js';
import createTranscriptionQueue from './workers/transcription-worker.js';
import createTranscribeRouter from './routes/transcribe.js';
import createStatusRouter from './routes/status.js';
import createTranscriptRouter from './routes/transcript.js';
import { validateCookies, getCookieHealth, getYtdlpVersion } from './lib/youtube-downloader.js';

const app = express();

// Trust proxy (needed for DigitalOcean App Platform X-Forwarded-For headers)
app.set('trust proxy', 1);

// ===== STARTUP COOKIE VERIFICATION =====
logger.info('=== Cookie Injection Status ===');
const cookieValidation = validateCookies();
if (cookieValidation.valid) {
  logger.info('✅ YouTube cookies loaded successfully', {
    path: cookieValidation.path,
    cookieCount: cookieValidation.cookieCount,
    ageHours: cookieValidation.ageHours,
    status: cookieValidation.status,
  });
  if (cookieValidation.warning) {
    logger.warn('⚠️ Cookie warning: ' + cookieValidation.warning);
  }
} else {
  logger.warn('⚠️ YouTube cookies NOT available - running without auth', {
    status: cookieValidation.status,
    warning: cookieValidation.warning,
  });
  logger.warn('⚠️ Bot detection may occur. To fix: export cookies from Chrome to /app/cookies/youtube_cookies.txt');
}
logger.info('================================');

// Initialize transcription queue (persisted to Redis)
const transcriptionQueue = createTranscriptionQueue();

logger.info('YouTube Transcription Service Starting', {
  nodeEnv: config.nodeEnv,
  port: config.port,
  redisUrl: config.redis.url,
  whisperModel: config.whisper.model,
  cookieStatus: cookieValidation.status,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(globalRateLimiter);

// Serve static files (web UI)
app.use(express.static('./public'));

// Public health check endpoint with cookie monitoring
app.get('/health', async (req, res) => {
  try {
    const health = await transcriptionQueue.getQueueHealth();
    const cookieHealth = getCookieHealth();
    const ytdlpVersion = await getYtdlpVersion();
    
    // Determine overall status based on cookie health
    let overallStatus = 'ok';
    if (cookieHealth.cookies.status === 'critical') {
      overallStatus = 'degraded';
    } else if (cookieHealth.cookies.status === 'missing' || cookieHealth.cookies.status === 'invalid') {
      overallStatus = 'warning';
    }
    
    res.json({
      status: overallStatus,
      redis: 'connected',
      ...health,
      ytdlp: {
        version: ytdlpVersion,
        ...cookieHealth,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error.message,
    });
    res.status(503).json({
      status: 'error',
      redis: 'disconnected',
      error: error.message,
    });
  }
});

// API Routes (public for submission, can be protected)
app.use(optionalAuthMiddleware);
app.use(createTranscribeRouter(transcriptionQueue));
app.use(createStatusRouter(transcriptionQueue));
app.use(createTranscriptRouter(transcriptionQueue));

// Root path - serve web UI
app.get('/', (req, res) => {
  res.sendFile('./public/index.html', { root: '.' });
});

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');

  try {
    await transcriptionQueue.close();
    logger.info('Queue closed');
  } catch (error) {
    logger.error('Error closing queue', {
      error: error.message,
    });
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');

  try {
    await transcriptionQueue.close();
    logger.info('Queue closed');
  } catch (error) {
    logger.error('Error closing queue', {
      error: error.message,
    });
  }

  process.exit(0);
});

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  logger.info(`YouTube Transcription Service listening on port ${PORT}`, {
    url: `http://localhost:${PORT}`,
    apiUrl: `http://localhost:${PORT}/api`,
    healthCheck: `http://localhost:${PORT}/health`,
    cookieStatus: cookieValidation.status,
    cookieWarning: cookieValidation.warning || 'none',
  });
});

export default app;
