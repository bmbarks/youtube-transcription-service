#!/bin/bash
# Explicit entrypoint for YouTube Transcription Service
# Handles cookie download from Spaces with full logging

set -x  # Debug mode - log all commands

echo "=== ENTRYPOINT START ==="
echo "Time: $(date)"
echo "Working dir: $(pwd)"

# Check env vars
echo "YOUTUBE_COOKIES_URL: $YOUTUBE_COOKIES_URL"
echo "DO_SPACES_KEY: ${DO_SPACES_KEY:0:10}..."
echo "DO_SPACES_REGION: $DO_SPACES_REGION"

# Download cookies if configured
if [ -n "$YOUTUBE_COOKIES_URL" ]; then
  echo "Attempting cookie download..."
  python3 -u << 'EOF'
import os, sys
from pathlib import Path

print("Python script started")
ACCESS_KEY = os.getenv('DO_SPACES_KEY')
SECRET_KEY = os.getenv('DO_SPACES_SECRET')
COOKIES_URL = os.getenv('YOUTUBE_COOKIES_URL')
REGION = os.getenv('DO_SPACES_REGION', 'sfo3')
ENDPOINT = os.getenv('DO_SPACES_ENDPOINT', 'https://sfo3.digitaloceanspaces.com')
OUTPUT_PATH = '/app/cookies/youtube_cookies.txt'

print(f"ACCESS_KEY: {ACCESS_KEY[:10] if ACCESS_KEY else 'MISSING'}")
print(f"COOKIES_URL: {COOKIES_URL}")

if not ACCESS_KEY or not SECRET_KEY:
  print("ERROR: Missing Spaces credentials")
  sys.exit(0)

try:
  import boto3
  print("boto3 imported successfully")
  
  parts = COOKIES_URL.replace('s3://', '').split('/', 1)
  bucket = parts[0]
  key = parts[1] if len(parts) > 1 else 'config/youtube_cookies.txt'
  
  print(f"Bucket: {bucket}, Key: {key}")
  
  s3 = boto3.client('s3', region_name=REGION, endpoint_url=ENDPOINT,
    aws_access_key_id=ACCESS_KEY, aws_secret_access_key=SECRET_KEY)
  
  Path(OUTPUT_PATH).parent.mkdir(parents=True, exist_ok=True)
  s3.download_file(bucket, key, OUTPUT_PATH)
  
  size = Path(OUTPUT_PATH).stat().st_size
  print(f"SUCCESS: Cookies downloaded ({size} bytes)")
  
except Exception as e:
  print(f"ERROR: {e}")
  import traceback
  traceback.print_exc()

EOF
else
  echo "YOUTUBE_COOKIES_URL not set"
fi

# Verify
if [ -f "/app/cookies/youtube_cookies.txt" ]; then
  SIZE=$(wc -c < /app/cookies/youtube_cookies.txt)
  echo "Cookies verified: $SIZE bytes"
else
  echo "WARNING: Cookies file not found"
fi

echo "=== ENTRYPOINT: Starting Node.js ==="
exec node /app/server.js
