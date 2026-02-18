import dotenv from 'dotenv';

dotenv.config();

const requiredVars = [
  'REDIS_URL',
  'DO_SPACES_KEY',
  'DO_SPACES_SECRET',
  'DO_SPACES_REGION',
  'DO_SPACES_BUCKET',
  'DO_SPACES_ENDPOINT',
];

const missingVars = requiredVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
  
  redis: {
    url: process.env.REDIS_URL,
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: process.env.REDIS_RETRY_STRATEGY || 'exponential',
  },
  
  spaces: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
    region: process.env.DO_SPACES_REGION,
    bucket: process.env.DO_SPACES_BUCKET,
    endpoint: process.env.DO_SPACES_ENDPOINT,
  },
  
  whisper: {
    model: process.env.WHISPER_MODEL || 'small',
    device: process.env.WHISPER_DEVICE || 'cpu',
    language: process.env.WHISPER_LANGUAGE || 'en',
    beamSize: parseInt(process.env.WHISPER_BEAM_SIZE || '5', 10),
    bestOf: parseInt(process.env.WHISPER_BEST_OF || '5', 10),
  },
  
  ytdlp: {
    socketTimeout: parseInt(process.env.YTTDLP_SOCKET_TIMEOUT || '30', 10),
    retries: parseInt(process.env.YTTDLP_RETRIES || '3', 10),
    extractFlat: process.env.YTTDLP_EXTRACT_FLAT === 'true',
  },
  
  api: {
    keySecret: process.env.API_KEY_SECRET || 'dev-secret',
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '1', 10),
    timeoutMs: parseInt(process.env.WORKER_TIMEOUT_MS || '3600000', 10),
    maxAttempts: parseInt(process.env.WORKER_MAX_ATTEMPTS || '2', 10),
    jobRemovalDelayMs: parseInt(process.env.JOB_REMOVAL_DELAY_MS || '3600000', 10),
  },
  
  features: {
    enableYoutubeTier: process.env.ENABLE_YOUTUBE_TIER !== 'false',
    enableWhisperTier: process.env.ENABLE_WHISPER_TIER !== 'false',
    enableFallback: process.env.ENABLE_FALLBACK !== 'false',
  },
};

export default config;
