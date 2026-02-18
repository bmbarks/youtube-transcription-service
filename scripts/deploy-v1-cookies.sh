#!/bin/bash
# =============================================================================
# YouTube Transcription Service - V1 Cookie Injection Deployment
# =============================================================================
# 
# This script deploys the service with cookie injection for bot detection bypass.
# Run this on your DigitalOcean droplet.
#
# PREREQUISITES:
# 1. SSH into your droplet
# 2. Clone/pull latest code
# 3. Copy cookies file to server
# 4. Run this script
#
# Usage: ./scripts/deploy-v1-cookies.sh
# =============================================================================

set -e  # Exit on error

echo "=============================================="
echo "🦞 YouTube Transcription Service V1 Deployment"
echo "   Cookie Injection for Bot Detection Bypass"
echo "=============================================="

# Configuration
APP_DIR="${APP_DIR:-/root/youtube-transcription-service}"
COOKIES_SOURCE="${COOKIES_SOURCE:-./cookies/youtube_cookies.txt}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}ERROR: docker-compose.yml not found. Run from project root.${NC}"
    exit 1
fi

# Check cookies file exists
echo ""
echo "📋 Step 1: Verifying cookies file..."
if [ -f "$COOKIES_SOURCE" ]; then
    COOKIE_COUNT=$(grep -v "^#" "$COOKIES_SOURCE" | grep -c $'\t' || true)
    echo -e "${GREEN}✅ Cookies found: ${COOKIE_COUNT} cookies${NC}"
else
    echo -e "${RED}❌ Cookies file not found at: $COOKIES_SOURCE${NC}"
    echo ""
    echo "To fix:"
    echo "1. Export cookies from Chrome using 'Get cookies.txt LOCALLY' extension"
    echo "2. Copy to: $COOKIES_SOURCE"
    echo "3. Re-run this script"
    exit 1
fi

# Check .env exists
echo ""
echo "📋 Step 2: Verifying environment variables..."
if [ -f ".env" ]; then
    echo -e "${GREEN}✅ .env file found${NC}"
    
    # Check required vars
    REQUIRED_VARS=("DO_SPACES_KEY" "DO_SPACES_SECRET" "DO_SPACES_BUCKET" "REDIS_URL")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^${var}=" .env; then
            echo "   ✓ $var is set"
        else
            echo -e "${YELLOW}   ⚠ $var is NOT set${NC}"
        fi
    done
else
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Copy .env.example to .env and configure it."
    exit 1
fi

# Stop existing containers
echo ""
echo "📋 Step 3: Stopping existing containers..."
docker compose down 2>/dev/null || true
echo -e "${GREEN}✅ Containers stopped${NC}"

# Build fresh image
echo ""
echo "📋 Step 4: Building Docker image (this may take 2-5 minutes)..."
docker compose build --no-cache
echo -e "${GREEN}✅ Image built${NC}"

# Start containers
echo ""
echo "📋 Step 5: Starting containers..."
docker compose up -d
echo -e "${GREEN}✅ Containers started${NC}"

# Wait for health check
echo ""
echo "📋 Step 6: Waiting for service health check..."
echo "   (waiting up to 60 seconds for startup)"

for i in {1..12}; do
    sleep 5
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Service is healthy!${NC}"
        break
    fi
    echo "   ... still starting (${i}/12)"
done

# Final health check
echo ""
echo "📋 Step 7: Final verification..."
HEALTH=$(curl -sf http://localhost:3000/health 2>/dev/null || echo '{"status":"error"}')
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

# Check cookie status in health
COOKIE_STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$COOKIE_STATUS" = "ok" ] || [ "$COOKIE_STATUS" = "fresh" ]; then
    echo ""
    echo -e "${GREEN}=============================================="
    echo "🎉 DEPLOYMENT SUCCESSFUL!"
    echo "=============================================="
    echo ""
    echo "Service is running at: http://localhost:3000"
    echo "Health check: http://localhost:3000/health"
    echo "Cookie status: http://localhost:3000/api/cookie-status"
    echo ""
    echo "Test command:"
    echo "  curl -X POST http://localhost:3000/api/transcribe \\"
    echo "    -H 'Content-Type: application/json' \\"
    echo "    -d '{\"url\": \"https://www.youtube.com/watch?v=2-RWB-k2zLM\"}'"
    echo "=============================================="
    echo -e "${NC}"
else
    echo ""
    echo -e "${YELLOW}=============================================="
    echo "⚠️  DEPLOYMENT COMPLETE (with warnings)"
    echo "=============================================="
    echo ""
    echo "Service is running but cookie status is: $COOKIE_STATUS"
    echo "Check: curl http://localhost:3000/api/cookie-status"
    echo "=============================================="
    echo -e "${NC}"
fi
