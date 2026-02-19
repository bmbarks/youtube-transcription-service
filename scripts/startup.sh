#!/bin/bash
# Startup script for YouTube Transcription Service
# Downloads cookies from Spaces before starting the server

set -e

echo "=== YouTube Transcription Service Startup ==="
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Download cookies from Spaces (if configured)
if [ -n "$YOUTUBE_COOKIES_URL" ]; then
  echo "📥 Downloading YouTube cookies from Spaces..."
  
  # Use Python + boto3 to download (more reliable than Node AWS SDK)
  python3 << 'PYSCRIPT'
import os
import sys
from pathlib import Path

try:
    import boto3
except ImportError:
    print("⚠️ boto3 not installed - skipping cookie download")
    sys.exit(0)

COOKIES_URL = os.getenv('YOUTUBE_COOKIES_URL')
ACCESS_KEY = os.getenv('DO_SPACES_KEY')
SECRET_KEY = os.getenv('DO_SPACES_SECRET')
REGION = os.getenv('DO_SPACES_REGION', 'sfo3')
ENDPOINT = os.getenv('DO_SPACES_ENDPOINT', 'https://sfo3.digitaloceanspaces.com')
OUTPUT_PATH = os.getenv('YOUTUBE_COOKIES_PATH', '/app/cookies/youtube_cookies.txt')

if not COOKIES_URL:
    print("ℹ️ YOUTUBE_COOKIES_URL not set")
    sys.exit(0)

if not ACCESS_KEY or not SECRET_KEY:
    print("⚠️ DO_SPACES_KEY or DO_SPACES_SECRET not set")
    sys.exit(0)

try:
    # Parse S3 URL (s3://bucket/key)
    parts = COOKIES_URL.replace('s3://', '').split('/', 1)
    bucket = parts[0]
    key = parts[1] if len(parts) > 1 else 'config/youtube_cookies.txt'
    
    # Create S3 client for Spaces
    s3 = boto3.client(
        's3',
        region_name=REGION,
        endpoint_url=ENDPOINT,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY
    )
    
    # Download file
    Path(OUTPUT_PATH).parent.mkdir(parents=True, exist_ok=True)
    s3.download_file(bucket, key, OUTPUT_PATH)
    
    # Verify content
    size = Path(OUTPUT_PATH).stat().st_size
    with open(OUTPUT_PATH) as f:
        cookies = len([l for l in f if l.strip() and not l.startswith('#') and '\t' in l])
    
    print(f"✅ Cookies loaded: {size} bytes, {cookies} cookies")
    sys.exit(0)
    
except Exception as e:
    print(f"⚠️ Cookie download failed: {e}")
    sys.exit(0)  # Non-fatal
PYSCRIPT

else
  echo "ℹ️ YOUTUBE_COOKIES_URL not set - running without pre-loaded cookies"
fi

# Verify cookie file
if [ -f "/app/cookies/youtube_cookies.txt" ]; then
  echo "✅ Cookies file verified"
else
  echo "⚠️ No cookies file - Tier 1 (YouTube captions) will fail, using Whisper fallback"
fi

echo "=== Starting Node.js server ==="
exec node /app/server.js
