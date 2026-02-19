#!/usr/bin/env node
/**
 * Upload YouTube Cookies to DigitalOcean Spaces
 * 
 * Usage:
 *   DO_SPACES_KEY=xxx DO_SPACES_SECRET=xxx node scripts/upload-cookies.js
 *   
 * Or with env file:
 *   node scripts/upload-cookies.js (reads from .env)
 * 
 * This script uploads cookies/youtube_cookies.txt to:
 *   s3://barkstech-media/youtube-transcription-cookies/youtube_cookies.txt
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync, statSync } from 'fs';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env if exists
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Configuration
const SPACES_REGION = process.env.DO_SPACES_REGION || 'sfo3';
const SPACES_BUCKET = process.env.DO_SPACES_BUCKET || 'barkstech-media';
const SPACES_ENDPOINT = process.env.DO_SPACES_ENDPOINT || `https://${SPACES_REGION}.digitaloceanspaces.com`;
const COOKIES_KEY = 'youtube-transcription-cookies/youtube_cookies.txt';
const LOCAL_COOKIES_PATH = join(ROOT_DIR, 'cookies', 'youtube_cookies.txt');

async function uploadCookies() {
  console.log('🍪 YouTube Cookies Upload Script');
  console.log('================================\n');

  // Validate credentials
  const accessKey = process.env.DO_SPACES_KEY;
  const secretKey = process.env.DO_SPACES_SECRET;

  if (!accessKey || !secretKey) {
    console.error('❌ Missing credentials!');
    console.error('   Set DO_SPACES_KEY and DO_SPACES_SECRET environment variables');
    console.error('\n   Example:');
    console.error('   DO_SPACES_KEY=xxx DO_SPACES_SECRET=xxx node scripts/upload-cookies.js');
    process.exit(1);
  }

  // Validate local cookies file
  if (!existsSync(LOCAL_COOKIES_PATH)) {
    console.error(`❌ Cookies file not found: ${LOCAL_COOKIES_PATH}`);
    console.error('   Export cookies from Chrome using "Get cookies.txt LOCALLY" extension');
    process.exit(1);
  }

  // Read and validate cookies
  const cookiesContent = readFileSync(LOCAL_COOKIES_PATH, 'utf-8');
  const cookieLines = cookiesContent.split('\n').filter(line => 
    line.trim() && !line.startsWith('#') && line.includes('\t')
  );

  if (cookieLines.length < 10) {
    console.error(`❌ Cookies file has only ${cookieLines.length} cookies (expected 50+)`);
    console.error('   The cookies file may be invalid or corrupted');
    process.exit(1);
  }

  const stats = statSync(LOCAL_COOKIES_PATH);
  const ageHours = Math.round((Date.now() - stats.mtimeMs) / (1000 * 60 * 60));

  console.log(`📁 Local cookies file: ${LOCAL_COOKIES_PATH}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Cookie count: ${cookieLines.length}`);
  console.log(`   Age: ${ageHours} hours\n`);

  if (ageHours > 72) {
    console.warn(`⚠️  Warning: Cookies are ${ageHours} hours old - may be stale`);
  }

  // Create S3 client for DO Spaces
  const client = new S3Client({
    region: SPACES_REGION,
    endpoint: SPACES_ENDPOINT,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: false, // Required for DO Spaces
  });

  console.log(`☁️  Uploading to: s3://${SPACES_BUCKET}/${COOKIES_KEY}`);
  console.log(`   Endpoint: ${SPACES_ENDPOINT}\n`);

  try {
    // Check if file already exists
    try {
      const headCmd = new HeadObjectCommand({
        Bucket: SPACES_BUCKET,
        Key: COOKIES_KEY,
      });
      const existing = await client.send(headCmd);
      console.log(`📋 Existing file found (${(existing.ContentLength / 1024).toFixed(1)} KB)`);
      console.log(`   Will be replaced...\n`);
    } catch (e) {
      if (e.name !== 'NotFound') {
        // Ignore NotFound, throw other errors
        console.log('📋 No existing file found (first upload)\n');
      }
    }

    // Upload
    const putCmd = new PutObjectCommand({
      Bucket: SPACES_BUCKET,
      Key: COOKIES_KEY,
      Body: cookiesContent,
      ContentType: 'text/plain',
      ACL: 'private', // Keep cookies private
      Metadata: {
        'uploaded-at': new Date().toISOString(),
        'cookie-count': cookieLines.length.toString(),
        'age-hours': ageHours.toString(),
      },
    });

    await client.send(putCmd);

    console.log('✅ Upload successful!\n');
    console.log('📍 File location:');
    console.log(`   Bucket: ${SPACES_BUCKET}`);
    console.log(`   Key: ${COOKIES_KEY}`);
    console.log(`   Full path: s3://${SPACES_BUCKET}/${COOKIES_KEY}`);
    console.log('\n🔧 Environment variable to add to DO App Platform:');
    console.log(`   YOUTUBE_COOKIES_URL=s3://${SPACES_BUCKET}/${COOKIES_KEY}`);
    console.log('\n✨ Done! The app will download cookies on startup.');

  } catch (error) {
    console.error(`❌ Upload failed: ${error.message}`);
    if (error.Code === 'AccessDenied') {
      console.error('   Check that your DO_SPACES_KEY has write access to the bucket');
    }
    process.exit(1);
  }
}

uploadCookies().catch(console.error);
