#!/bin/bash
# Startup script for YouTube Transcription Service
# Downloads cookies from Spaces before starting the server
#
# This is the entrypoint for Docker - bulletproof design:
# - If cookie download fails, server still starts (Whisper fallback)
# - All errors are logged but don't block startup

set -e

echo "=== YouTube Transcription Service Startup ==="
echo "Time: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Download cookies from Spaces (if configured)
if [ -n "$YOUTUBE_COOKIES_URL" ]; then
  echo "📥 Downloading YouTube cookies from Spaces..."
  node /app/scripts/download-cookies.js || {
    echo "⚠️ Cookie download failed (non-fatal) - continuing with Whisper-only mode"
  }
else
  echo "ℹ️ YOUTUBE_COOKIES_URL not set - running without pre-loaded cookies"
fi

# Verify cookie status
if [ -f "/app/cookies/youtube_cookies.txt" ]; then
  COOKIE_SIZE=$(stat -f%z /app/cookies/youtube_cookies.txt 2>/dev/null || stat -c%s /app/cookies/youtube_cookies.txt 2>/dev/null || echo "unknown")
  COOKIE_COUNT=$(grep -v "^#" /app/cookies/youtube_cookies.txt 2>/dev/null | grep -c $'\t' || echo "0")
  echo "✅ Cookies loaded: ${COOKIE_SIZE} bytes, ${COOKIE_COUNT} cookies"
else
  echo "⚠️ No cookies file present - Tier 1 (YouTube captions) may fail"
fi

echo "=== Starting Node.js server ==="
exec node /app/server.js
