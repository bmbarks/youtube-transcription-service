import logger from '../utils/logger.js';

/**
 * Global error handler middleware
 * Catches and formats all errors consistently
 */
export function errorHandler(err, req, res, next) {
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Extract error details
  const statusCode = err.statusCode || err.status || 500;
  const errorCode = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An internal error occurred';

  // Log the error
  logger.error('Request error', {
    errorId,
    statusCode,
    errorCode,
    message,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: err.stack,
  });

  // Send error response
  res.status(statusCode).json({
    error: message,
    code: errorCode,
    errorId, // For debugging
    timestamp: new Date().toISOString(),
  });
}

/**
 * 404 handler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method,
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default { errorHandler, notFoundHandler, asyncHandler };
