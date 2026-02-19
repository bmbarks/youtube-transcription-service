/**
 * YouTube Downloader - Centralized yt-dlp wrapper with cookie support
 * 
 * V1.2 Cookie Injection - Bypasses YouTube bot detection by using
 * authenticated cookies from a logged-in Chrome session.
 * 
 * FIXED: v1.2 - Better quote handling, improved logging, safer command construction
 * 
 * Key Features:
 * - Cookie injection for bot detection bypass
 * - Cookie file validation on startup
 * - Cookie age monitoring for health checks
 * - Graceful fallback if cookies unavailable
 * - User-friendly error messages
 * - Proper shell escaping with consistent quote handling
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync, readFileSync } from 'fs';
import logger from '../utils/logger.js';

const execPromise = promisify(exec);

// Cookie configuration
const COOKIES_PATH = process.env.YOUTUBE_COOKIES_PATH || '/app/cookies/youtube_cookies.txt';
const COOKIES_MAX_AGE_HOURS = 72; // Warn if cookies older than 3 days
const COOKIES_CRITICAL_AGE_HOURS = 168; // Critical if older than 7 days

/**
 * Bot detection error patterns from yt-dlp
 * These indicate YouTube is blocking us
 */
const BOT_DETECTION_PATTERNS = [
  "Sign in to confirm you're not a bot",
  'Sign in to confirm your age',
  'This video is unavailable',
  'Video unavailable',
  'Private video',
  "confirm you're not a bot",
  'bot detection',
  'HTTP Error 403',
  'HTTP Error 429',
  'Too Many Requests',
  'are you a robot',
  'captcha',
];

/**
 * Patterns that indicate cookies are expired or invalid
 */
const COOKIES_EXPIRED_PATTERNS = [
  'cookies are not valid',
  'cookies have expired',
  'Login required',
  'Please sign in',
  'session has expired',
];

/**
 * Check if cookies file exists and is valid
 */
export function validateCookies() {
  const result = {
    exists: false,
    valid: false,
    path: COOKIES_PATH,
    cookieCount: 0,
    ageHours: null,
    status: 'missing',
    warning: null,
  };

  if (!existsSync(COOKIES_PATH)) {
    result.status = 'missing';
    result.warning = `Cookie file not found at ${COOKIES_PATH}`;
    logger.warn('⚠️ YouTube cookies file not found', { 
      path: COOKIES_PATH,
      recommendation: 'Export cookies from Chrome using EditThisCookie extension',
    });
    return result;
  }

  result.exists = true;

  try {
    const stats = statSync(COOKIES_PATH);
    const ageMs = Date.now() - stats.mtimeMs;
    result.ageHours = Math.round(ageMs / (1000 * 60 * 60));

    // Read and count cookies
    const content = readFileSync(COOKIES_PATH, 'utf-8');
    const lines = content.split('\n').filter(line => 
      line.trim() && !line.startsWith('#') && line.includes('\t')
    );
    result.cookieCount = lines.length;

    if (result.cookieCount < 5) {
      result.status = 'invalid';
      result.warning = `Cookie file has only ${result.cookieCount} cookies (need minimum 5)`;
      logger.warn('⚠️ Cookie file has too few cookies', { 
        count: result.cookieCount,
        recommendation: 'Re-export cookies - file may be corrupted',
      });
      return result;
    }

    // Check age
    if (result.ageHours > COOKIES_CRITICAL_AGE_HOURS) {
      result.status = 'critical';
      result.warning = `Cookies are ${result.ageHours} hours old (>${COOKIES_CRITICAL_AGE_HOURS}h) - likely expired`;
      result.valid = true; // Still try to use them
      logger.warn('⚠️ CRITICAL: Cookies are stale', {
        ageHours: result.ageHours,
        recommendation: 'Refresh cookies from Chrome ASAP',
      });
    } else if (result.ageHours > COOKIES_MAX_AGE_HOURS) {
      result.status = 'stale';
      result.warning = `Cookies are ${result.ageHours} hours old (>${COOKIES_MAX_AGE_HOURS}h) - may need refresh`;
      result.valid = true;
      logger.info('ℹ️ Cookies are getting stale', {
        ageHours: result.ageHours,
        recommendation: 'Consider refreshing cookies soon',
      });
    } else {
      result.status = 'fresh';
      result.valid = true;
      logger.info('✅ Cookies are fresh and valid', {
        ageHours: result.ageHours,
        cookieCount: result.cookieCount,
      });
    }

    return result;
  } catch (error) {
    result.status = 'error';
    result.warning = `Failed to read cookie file: ${error.message}`;
    logger.error('❌ Failed to validate cookies', { 
      error: error.message,
      path: COOKIES_PATH,
    });
    return result;
  }
}

/**
 * Get cookie arguments for yt-dlp command
 * Returns array of arguments to append to command
 * 
 * FIXED: v1.2 - Better logging to confirm cookies are being injected
 */
export function getCookieArgs() {
  const validation = validateCookies();
  
  if (validation.valid && validation.exists) {
    // Return array without quotes - the executeYtdlp() function handles all quoting
    const args = ['--cookies', COOKIES_PATH];
    logger.info('🔐 Injecting YouTube cookies into yt-dlp command', {
      cookieCount: validation.cookieCount,
      cookieAge: `${validation.ageHours}h`,
      cookieStatus: validation.status,
      cookiePath: COOKIES_PATH,
      willInject: true,
    });
    return args;
  }
  
  // No cookies - log warning and return empty
  logger.warn('⚠️ No valid cookies - yt-dlp will run WITHOUT authentication', {
    status: validation.status,
    warning: validation.warning,
    willFallback: 'YouTube authentication will fail, Whisper Tier 2 will be used',
  });
  return [];
}

/**
 * Parse yt-dlp error to determine if it's bot detection
 */
export function parseBotDetectionError(error) {
  const errorStr = error.message || error.toString();
  
  // Check for bot detection
  for (const pattern of BOT_DETECTION_PATTERNS) {
    if (errorStr.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        isBotDetection: true,
        isExpiredCookies: false,
        code: 'BOT_DETECTION',
        userMessage: 'YouTube is blocking requests. Cookies may need to be refreshed.',
        technicalMessage: `Bot detection triggered: ${pattern}`,
      };
    }
  }

  // Check for expired cookies
  for (const pattern of COOKIES_EXPIRED_PATTERNS) {
    if (errorStr.toLowerCase().includes(pattern.toLowerCase())) {
      return {
        isBotDetection: false,
        isExpiredCookies: true,
        code: 'COOKIES_EXPIRED',
        userMessage: 'YouTube session has expired. Please re-export cookies from Chrome.',
        technicalMessage: `Cookie expiration detected: ${pattern}`,
      };
    }
  }

  // Not a bot detection error
  return {
    isBotDetection: false,
    isExpiredCookies: false,
    code: 'OTHER',
    userMessage: 'Failed to access YouTube video.',
    technicalMessage: errorStr,
  };
}

/**
 * Safely escape shell argument
 * Handles spaces and special characters
 */
function escapeShellArg(arg) {
  // If arg is already quoted, return as-is
  if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
    return arg;
  }
  
  // If arg contains spaces or special shell chars, quote it
  if (/[\s"'$`\\|&;<>]/.test(arg)) {
    // Use single quotes for safety, but escape any single quotes in the content
    const escaped = arg.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  }
  
  // Safe argument, no quoting needed
  return arg;
}

/**
 * Execute yt-dlp command with cookies and error handling
 * 
 * FIXED: v1.2 - Better quote handling, safer command construction
 * 
 * @param {string[]} args - Array of yt-dlp arguments (unquoted)
 * @param {object} options - Execution options (timeout, maxBuffer)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function executeYtdlp(args, options = {}) {
  const cookieArgs = getCookieArgs();
  const allArgs = [...cookieArgs, ...args];
  
  // Build command with proper shell escaping
  // Each argument is escaped individually to handle spaces and special chars
  const escapedArgs = allArgs.map(escapeShellArg);
  const command = `yt-dlp ${escapedArgs.join(' ')}`;
  
  const execOptions = {
    timeout: options.timeout || 30000,
    maxBuffer: options.maxBuffer || 50 * 1024 * 1024,
  };

  // Log command with cookie path redacted for security
  const sanitizedCommand = command.replace(COOKIES_PATH, '[COOKIES_PATH]');
  logger.debug('Executing yt-dlp', {
    command: sanitizedCommand,
    timeout: execOptions.timeout,
    hasCookies: cookieArgs.length > 0,
    argsCount: allArgs.length,
  });

  try {
    const result = await execPromise(command, execOptions);
    logger.debug('yt-dlp execution succeeded', {
      stderrLength: result.stderr?.length || 0,
    });
    return result;
  } catch (error) {
    const parsed = parseBotDetectionError(error);
    
    if (parsed.isBotDetection || parsed.isExpiredCookies) {
      logger.error('❌ yt-dlp failed with authentication issue', {
        code: parsed.code,
        technical: parsed.technicalMessage,
        userMessage: parsed.userMessage,
      });
      
      const enrichedError = new Error(parsed.userMessage);
      enrichedError.code = parsed.code;
      enrichedError.technical = parsed.technicalMessage;
      enrichedError.isBotDetection = parsed.isBotDetection;
      enrichedError.isExpiredCookies = parsed.isExpiredCookies;
      throw enrichedError;
    }
    
    // Log other errors with context
    logger.error('yt-dlp execution failed', {
      code: error.code,
      signal: error.signal,
      message: error.message,
      command: sanitizedCommand,
    });
    throw error;
  }
}

/**
 * Get yt-dlp version for health checks
 */
export async function getYtdlpVersion() {
  try {
    const { stdout } = await execPromise('yt-dlp --version', { timeout: 5000 });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get full cookie health status for /health endpoint
 */
export function getCookieHealth() {
  const validation = validateCookies();
  
  return {
    cookies: {
      status: validation.status,
      path: validation.path,
      exists: validation.exists,
      valid: validation.valid,
      cookieCount: validation.cookieCount,
      ageHours: validation.ageHours,
      warning: validation.warning,
      maxAgeHours: COOKIES_MAX_AGE_HOURS,
      criticalAgeHours: COOKIES_CRITICAL_AGE_HOURS,
    },
  };
}

export default {
  validateCookies,
  getCookieArgs,
  parseBotDetectionError,
  executeYtdlp,
  getYtdlpVersion,
  getCookieHealth,
  COOKIES_PATH,
};
