import rateLimit from 'express-rate-limit';
import config from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Rate limiter for transcription endpoint
 * Prevents abuse and ensures fair resource allocation
 */
export const transcribeRateLimiter = rateLimit({
  windowMs: config.api.rateLimitWindowMs,
  max: config.api.rateLimitMaxRequests,
  message: {
    error: 'Too many transcription requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: config.api.rateLimitWindowMs / 1000,
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      windowMs: config.api.rateLimitWindowMs,
      limit: config.api.rateLimitMaxRequests,
    });
    res.status(429).json({
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: config.api.rateLimitWindowMs / 1000,
    });
  },
  skip: (req) => {
    // Skip rate limiting for authenticated requests (Shadow)
    return req.headers.authorization?.startsWith('Bearer ');
  },
});

/**
 * Global rate limiter (all endpoints)
 * More lenient than transcribe limiter
 */
export const globalRateLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip for health checks
    return req.path === '/health';
  },
});

export default { transcribeRateLimiter, globalRateLimiter };
