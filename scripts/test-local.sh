#!/bin/bash
# =============================================================================
# Local Testing Script - YouTube Transcription Service V1
# =============================================================================
# 
# Tests the service locally with cookie injection.
# Run this BEFORE deploying to production.
#
# Usage: ./scripts/test-local.sh
# =============================================================================

set -e

echo "=============================================="
echo "🧪 Local Testing - YouTube Transcription V1"
echo "=============================================="

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_VIDEO="https://www.youtube.com/watch?v=2-RWB-k2zLM"  # Alan Watts - short video

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test 1: Health Check
echo ""
echo -e "${BLUE}Test 1: Health Check${NC}"
echo "GET $BASE_URL/health"
HEALTH=$(curl -sf "$BASE_URL/health" 2>/dev/null || echo '{"status":"error"}')
echo "$HEALTH" | python3 -m json.tool 2>/dev/null || echo "$HEALTH"

STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$STATUS" = "ok" ] || [ "$STATUS" = "fresh" ]; then
    echo -e "${GREEN}✅ Health check passed${NC}"
else
    echo -e "${RED}❌ Health check failed - status: $STATUS${NC}"
    exit 1
fi

# Test 2: Cookie Status
echo ""
echo -e "${BLUE}Test 2: Cookie Status${NC}"
echo "GET $BASE_URL/api/cookie-status"
COOKIE_STATUS=$(curl -sf "$BASE_URL/api/cookie-status" 2>/dev/null || echo '{"error":"failed"}')
echo "$COOKIE_STATUS" | python3 -m json.tool 2>/dev/null || echo "$COOKIE_STATUS"

COOKIE_VALID=$(echo "$COOKIE_STATUS" | grep -o '"valid":true' || echo "")
if [ -n "$COOKIE_VALID" ]; then
    echo -e "${GREEN}✅ Cookies are valid${NC}"
else
    echo -e "${YELLOW}⚠️  Cookies may not be valid - check output above${NC}"
fi

# Test 3: Submit Transcription Job
echo ""
echo -e "${BLUE}Test 3: Submit Transcription Job${NC}"
echo "POST $BASE_URL/api/transcribe"
echo "Video: $TEST_VIDEO"
JOB_RESPONSE=$(curl -sf -X POST "$BASE_URL/api/transcribe" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$TEST_VIDEO\"}" 2>/dev/null || echo '{"error":"failed"}')
echo "$JOB_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$JOB_RESPONSE"

JOB_ID=$(echo "$JOB_RESPONSE" | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
if [ -n "$JOB_ID" ]; then
    echo -e "${GREEN}✅ Job submitted: $JOB_ID${NC}"
else
    echo -e "${RED}❌ Failed to submit job${NC}"
    exit 1
fi

# Test 4: Check Job Status (poll)
echo ""
echo -e "${BLUE}Test 4: Checking Job Status${NC}"
echo "GET $BASE_URL/api/status/$JOB_ID"

for i in {1..30}; do
    sleep 5
    STATUS_RESPONSE=$(curl -sf "$BASE_URL/api/status/$JOB_ID" 2>/dev/null || echo '{"error":"failed"}')
    JOB_STATUS=$(echo "$STATUS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    echo "   [$i/30] Status: $JOB_STATUS"
    
    if [ "$JOB_STATUS" = "completed" ]; then
        echo ""
        echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
        echo ""
        echo -e "${GREEN}=============================================="
        echo "🎉 TRANSCRIPTION SUCCESSFUL!"
        echo "=============================================="
        echo ""
        
        # Extract transcript URL
        TRANSCRIPT_URL=$(echo "$STATUS_RESPONSE" | grep -o '"transcriptUrl":"[^"]*"' | cut -d'"' -f4)
        if [ -n "$TRANSCRIPT_URL" ]; then
            echo "Transcript URL: $TRANSCRIPT_URL"
            echo ""
            echo "Preview (first 500 chars):"
            curl -sf "$TRANSCRIPT_URL" 2>/dev/null | head -c 500
            echo ""
        fi
        echo -e "${NC}"
        exit 0
    elif [ "$JOB_STATUS" = "failed" ]; then
        echo ""
        echo "$STATUS_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$STATUS_RESPONSE"
        echo ""
        echo -e "${RED}=============================================="
        echo "❌ TRANSCRIPTION FAILED"
        echo "=============================================="
        echo "Check the error message above."
        echo "If it's BOT_DETECTION or COOKIES_EXPIRED:"
        echo "  1. Re-export cookies from Chrome"
        echo "  2. Restart the service"
        echo "  3. Try again"
        echo -e "${NC}"
        exit 1
    fi
done

echo ""
echo -e "${YELLOW}⚠️  Job still processing after 2.5 minutes${NC}"
echo "Final status: $JOB_STATUS"
echo "Check manually: curl $BASE_URL/api/status/$JOB_ID"
