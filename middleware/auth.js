import config from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * API Key authentication middleware
 * Validates Bearer token for Shadow integration
 */
export function authMiddleware(req, res, next) {
  // Skip auth for public endpoints
  const publicEndpoints = ['/health', '/'];
  if (publicEndpoints.includes(req.path)) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn('Missing authorization header', {
      path: req.path,
      ip: req.ip,
    });
    return res.status(401).json({
      error: 'Missing authorization header',
      code: 'MISSING_AUTH_HEADER',
    });
  }

  // Extract token from "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    logger.warn('Invalid authorization header format', {
      path: req.path,
      ip: req.ip,
      format: authHeader.substring(0, 20) + '...',
    });
    return res.status(401).json({
      error: 'Invalid authorization header format',
      code: 'INVALID_AUTH_FORMAT',
    });
  }

  const token = parts[1];

  // Validate token against configured secret
  // In production, this would check against a database of valid API keys
  if (token !== config.api.keySecret) {
    logger.warn('Invalid API key', {
      path: req.path,
      ip: req.ip,
      token: token.substring(0, 10) + '...',
    });
    return res.status(403).json({
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
    });
  }

  logger.debug('API key validated', {
    path: req.path,
    ip: req.ip,
  });

  next();
}

/**
 * Optional auth middleware - allows requests with or without auth
 * Used for public endpoints that can also accept auth
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const token = parts[1];
      if (token === config.api.keySecret) {
        req.authenticated = true;
        req.apiKey = token;
      }
    }
  }

  next();
}

export default { authMiddleware, optionalAuthMiddleware };
