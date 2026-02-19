#!/usr/bin/env node
/**
 * Download YouTube Cookies from DigitalOcean Spaces (Startup Script)
 * 
 * Called automatically before server.js when YOUTUBE_COOKIES_URL is set.
 * Downloads cookies from DO Spaces to /app/cookies/youtube_cookies.txt
 * 
 * Design:
 * - If download fails: WARN but continue (Whisper fallback still works)
 * - If cookies are stale: WARN but use them
 * - If YOUTUBE_COOKIES_URL not set: Skip silently (no cookies mode)
 * 
 * This is bulletproof - any failure mode degrades gracefully.
 */

import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';

// Configuration
const COOKIES_URL = process.env.YOUTUBE_COOKIES_URL;
const OUTPUT_PATH = process.env.YOUTUBE_COOKIES_PATH || '/app/cookies/youtube_cookies.txt';
const SPACES_REGION = process.env.DO_SPACES_REGION || 'sfo3';
const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || `https://${SPACES_REGION}.digitaloceanspaces.com`;

// Stale thresholds
const STALE_HOURS = 72;
const CRITICAL_HOURS = 168;

function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  console.log(`${timestamp} [${level}] [cookie-loader] ${message}${metaStr}`);
}

function parseS3Url(url) {
  // Parse s3://bucket/key format
  const match = url.match(/^s3:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 URL format: ${url}. Expected s3://bucket/key`);
  }
  return { bucket: match[1], key: match[2] };
}

async function downloadCookies() {
  // Skip if no URL configured
  if (!COOKIES_URL) {
    log('INFO', 'YOUTUBE_COOKIES_URL not set - running without pre-loaded cookies');
    process.exit(0);
  }

  // Validate credentials
  const accessKey = process.env.DO_SPACES_KEY;
  const secretKey = process.env.DO_SPACES_SECRET;

  if (!accessKey || !secretKey) {
    log('WARN', 'DO_SPACES_KEY/SECRET not set - cannot download cookies, falling back to Whisper-only mode');
    process.exit(0); // Exit 0 - don't block startup
  }

  log('INFO', 'Starting cookie download', { url: COOKIES_URL });

  try {
    const { bucket, key } = parseS3Url(COOKIES_URL);

    // Create S3 client
    const client = new S3Client({
      region: SPACES_REGION,
      endpoint: SPACES_ENDPOINT,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: false,
    });

    // Check file metadata first
    let metadata = {};
    try {
      const headCmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
      const headResult = await client.send(headCmd);
      metadata = headResult.Metadata || {};
      
      const ageHours = parseInt(metadata['age-hours'] || '0', 10);
      const uploadedAt = metadata['uploaded-at'];
      
      if (ageHours > CRITICAL_HOURS) {
        log('WARN', `Cookies are critically old (${ageHours}h) - may be expired`, { uploadedAt });
      } else if (ageHours > STALE_HOURS) {
        log('WARN', `Cookies are stale (${ageHours}h) - consider refreshing`, { uploadedAt });
      }
    } catch (e) {
      log('DEBUG', 'Could not fetch metadata (non-critical)', { error: e.message });
    }

    // Download file
    const getCmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(getCmd);
    
    // Read body
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf-8');

    // Validate content
    const cookieLines = body.split('\n').filter(line => 
      line.trim() && !line.startsWith('#') && line.includes('\t')
    );

    if (cookieLines.length < 10) {
      log('WARN', `Downloaded cookies file has only ${cookieLines.length} cookies - may be invalid`);
    }

    // Ensure output directory exists
    const outputDir = dirname(OUTPUT_PATH);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write to disk
    writeFileSync(OUTPUT_PATH, body, 'utf-8');

    log('INFO', 'Cookies downloaded successfully', {
      path: OUTPUT_PATH,
      size: body.length,
      cookieCount: cookieLines.length,
    });

    process.exit(0);

  } catch (error) {
    log('WARN', `Failed to download cookies: ${error.message} - falling back to Whisper-only mode`);
    
    // Don't exit with error - let the app start without cookies
    process.exit(0);
  }
}

downloadCookies();
