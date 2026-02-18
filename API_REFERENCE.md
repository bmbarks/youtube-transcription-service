# API Reference

Complete REST API documentation for the YouTube Transcription Service.

---

## Base URL

```
http://localhost:3000
```

For production deployment, replace with your domain.

---

## Authentication

All endpoints (except `/health` and `/`) require Bearer token authentication:

```http
Authorization: Bearer <API_KEY_SECRET>
```

Missing or invalid authentication returns `401 Unauthorized`.

---

## Endpoints

### 1. Health Check (Public)

**Endpoint:** `GET /health`

**Authentication:** Not required

**Purpose:** Verify service and Redis connectivity

**Response (200 OK):**
```json
{
  "status": "ok",
  "redis": "connected",
  "uptime": 1234.567,
  "timestamp": "2026-02-18T10:30:00.000Z"
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "error",
  "redis": "disconnected",
  "error": "connect ECONNREFUSED 127.0.0.1:6379"
}
```

**Example:**
```bash
curl http://localhost:3000/health
```

---

### 2. Submit Transcription Job

**Endpoint:** `POST /api/transcribe`

**Authentication:** Required (Bearer token)

**Content-Type:** `application/json`

**Purpose:** Submit a YouTube video URL for transcription

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "forceWhisper": false
}
```

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | Yes | — | YouTube video URL |
| `forceWhisper` | boolean | No | false | Skip Tier 1, use Whisper directly |

**Request Headers:**
```
Authorization: Bearer <API_KEY_SECRET>
Content-Type: application/json
```

**Response (202 Accepted):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "videoId": "dQw4w9WgXcQ",
  "status": "queued",
  "estimatedWait": "varies (YouTube native ~<1s, fallback ~12min)",
  "tier": "auto (1 → 2)",
  "statusUrl": "/api/status/job_1739883000123_abc123"
}
```

**Response Headers:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 1645200600
Content-Type: application/json
```

**Error Responses:**

**400 Bad Request** — Invalid URL format:
```json
{
  "error": "Invalid YouTube URL",
  "code": "INVALID_YOUTUBE_URL"
}
```

**401 Unauthorized** — Missing or invalid API key:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

**429 Too Many Requests** — Rate limit exceeded:
```json
{
  "error": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

**500 Internal Server Error** — Server error:
```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

**Examples:**

Submit a video:
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  }'
```

Force Whisper fallback:
```bash
curl -X POST http://localhost:3000/api/transcribe \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "forceWhisper": true
  }'
```

---

### 3. Check Job Status

**Endpoint:** `GET /api/status/{jobId}`

**Authentication:** Required (Bearer token)

**Purpose:** Poll the status and progress of a transcription job

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `jobId` | string | Unique job identifier from `/api/transcribe` response |

**Request Headers:**
```
Authorization: Bearer <API_KEY_SECRET>
```

**Response Queued (200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "queued",
  "state": "waiting",
  "position": 3,
  "estimatedWait": "5-15 minutes depending on queue size"
}
```

**Response Processing (200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "processing",
  "state": "active",
  "progress": 65,
  "stage": "transcribing with Whisper (65% done)",
  "estimatedTimeRemaining": "~6 minutes"
}
```

**Response Complete (200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "complete",
  "videoId": "dQw4w9WgXcQ",
  "resultsUrl": "/api/transcript/dQw4w9WgXcQ",
  "completedAt": "2026-02-18T10:15:30.000Z"
}
```

**Response Failed (200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "failed",
  "error": "Audio download failed after 3 retries",
  "attempts": 2,
  "maxAttempts": 2,
  "failedAt": "2026-02-18T10:20:00.000Z"
}
```

**Progress Stages:**

| Progress | Stage | Estimated Time |
|----------|-------|-----------------|
| 0-10% | Downloading metadata | <5s |
| 10-40% | YouTube native transcript | <1s |
| 40-50% | Downloading audio | 30-120s |
| 50-90% | Whisper transcription | 8-15 min |
| 90-100% | Uploading to storage | 10-30s |

**Error Responses:**

**401 Unauthorized** — Invalid API key:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

**404 Not Found** — Job doesn't exist:
```json
{
  "error": "Job not found",
  "code": "JOB_NOT_FOUND",
  "jobId": "job_1739883000123_abc123"
}
```

**Examples:**

Check job status:
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/status/job_1739883000123_abc123
```

Poll until completion (bash):
```bash
#!/bin/bash
JOB_ID=$1
API_KEY=$2

while true; do
  RESPONSE=$(curl -s -H "Authorization: Bearer $API_KEY" \
    http://localhost:3000/api/status/$JOB_ID)
  
  STATUS=$(echo $RESPONSE | jq -r '.status')
  echo "Status: $STATUS"
  
  if [ "$STATUS" = "complete" ] || [ "$STATUS" = "failed" ]; then
    echo $RESPONSE | jq .
    break
  fi
  
  sleep 10
done
```

---

### 4. Retrieve Transcript

**Endpoint:** `GET /api/transcript/{videoId}`

**Authentication:** Required (Bearer token)

**Purpose:** Fetch the complete transcription result (available after job completes)

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | string | 11-character YouTube video ID |

**Request Headers:**
```
Authorization: Bearer <API_KEY_SECRET>
```

**Response (200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "videoId": "dQw4w9WgXcQ",
  "title": "Rick Astley - Never Gonna Give You Up",
  "channel": "Rick Astley",
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "source": "youtube-native",
  "confidence": 0.98,
  "processTime": "0.8 seconds",
  "transcriptUrl": "https://barkstech-media.nyc3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.txt",
  "transcriptJsonUrl": "https://barkstech-media.nyc3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.json",
  "metadata": {
    "duration": "3:33",
    "language": "en",
    "downloadedAt": "2026-02-18T10:15:00Z",
    "tier": 1
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `jobId` | string | Original job ID |
| `videoId` | string | YouTube video ID |
| `title` | string | Video title |
| `channel` | string | Channel name |
| `url` | string | Full YouTube URL |
| `source` | string | `youtube-native` or `whisper-fallback` |
| `confidence` | number | Accuracy confidence (0-1) |
| `processTime` | string | How long transcription took |
| `transcriptUrl` | string | Plain text transcript URL (DigitalOcean Spaces) |
| `transcriptJsonUrl` | string | Structured JSON transcript URL |
| `metadata.duration` | string | Video length (HH:MM:SS) |
| `metadata.language` | string | Detected language code (e.g., 'en') |
| `metadata.downloadedAt` | string | ISO 8601 timestamp |
| `metadata.tier` | number | Processing tier (1 or 2) |

**Error Responses:**

**401 Unauthorized** — Invalid API key:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

**404 Not Found** — Transcript not available:
```json
{
  "error": "Transcript not found for this video ID",
  "code": "TRANSCRIPT_NOT_FOUND",
  "videoId": "dQw4w9WgXcQ",
  "hint": "Submit a new transcription job via POST /api/transcribe"
}
```

**Examples:**

Retrieve transcript:
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/transcript/dQw4w9WgXcQ
```

Extract text content:
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/transcript/dQw4w9WgXcQ | \
  jq -r '.transcriptUrl' | \
  xargs curl
```

---

## Status Codes

### Success

| Code | Meaning | Use Case |
|------|---------|----------|
| 200 | OK | Status check, transcript retrieval, health check |
| 202 | Accepted | Job successfully queued |

### Client Errors

| Code | Meaning | Use Case |
|------|---------|----------|
| 400 | Bad Request | Invalid URL, malformed JSON |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Job ID or video ID not found |
| 429 | Too Many Requests | Rate limit exceeded |

### Server Errors

| Code | Meaning | Use Case |
|------|---------|----------|
| 500 | Internal Server Error | Unexpected server error |
| 503 | Service Unavailable | Redis disconnected, service not ready |

---

## Error Codes

| Code | Description | Resolution |
|------|-------------|-----------|
| `INVALID_URL` | URL is missing or not a string | Provide valid YouTube URL |
| `INVALID_YOUTUBE_URL` | URL format not recognized | Use full YouTube URL (youtube.com/watch?v=...) |
| `MISSING_AUTH_HEADER` | Authorization header missing | Add `Authorization: Bearer <key>` header |
| `INVALID_AUTH_FORMAT` | Authorization header malformed | Use format: `Bearer <token>` |
| `INVALID_API_KEY` | API key doesn't match | Verify `API_KEY_SECRET` in environment |
| `INVALID_VIDEO_ID` | Video ID format invalid | Use 11-character YouTube video ID |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry; see `retryAfter` |
| `JOB_NOT_FOUND` | Job ID doesn't exist | Check job ID is correct |
| `TRANSCRIPT_NOT_FOUND` | No transcript for video ID | Submit new transcription job first |
| `INTERNAL_ERROR` | Server error | Contact support, check logs |

---

## Rate Limiting

### Limits

- **Transcribe endpoint:** 100 requests per 15 minutes (unauthenticated)
- **Authenticated requests (Bearer token):** No limit applied
- **Global limit:** 100 requests per minute (all endpoints)

### Headers

All responses include rate limit information:

```
RateLimit-Limit: 100              # Max requests in window
RateLimit-Remaining: 87           # Requests remaining
RateLimit-Reset: 1645200600       # Unix timestamp when limit resets
```

### Handling 429

When rate limited:
1. Check `retryAfter` header (seconds to wait)
2. Implement exponential backoff (2^n, max 10 minutes)
3. Store job IDs to avoid resubmission

Example retry logic:
```python
import time
import requests

def retry_with_backoff(func, max_retries=3):
    for attempt in range(max_retries):
        try:
            return func()
        except requests.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = int(e.response.headers.get('retryAfter', 60))
                print(f"Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                raise
    raise Exception("Failed after max retries")
```

---

## Request/Response Examples

### Example 1: Complete Workflow

```bash
# 1. Submit job
JOB=$(curl -s -X POST http://localhost:3000/api/transcribe \
  -H "Authorization: Bearer my_api_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}')

JOB_ID=$(echo $JOB | jq -r '.jobId')
VIDEO_ID=$(echo $JOB | jq -r '.videoId')

echo "Job submitted: $JOB_ID"

# 2. Poll status
while true; do
  STATUS=$(curl -s -H "Authorization: Bearer my_api_key" \
    http://localhost:3000/api/status/$JOB_ID)
  
  if [ "$(echo $STATUS | jq -r '.status')" = "complete" ]; then
    echo "Transcription complete!"
    break
  fi
  
  echo "Status: $(echo $STATUS | jq -r '.status') - $(echo $STATUS | jq -r '.stage')"
  sleep 30
done

# 3. Retrieve transcript
curl -s -H "Authorization: Bearer my_api_key" \
  http://localhost:3000/api/transcript/$VIDEO_ID | jq .
```

### Example 2: Error Handling

```bash
# Invalid URL
curl -X POST http://localhost:3000/api/transcribe \
  -H "Authorization: Bearer my_api_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "not-a-valid-url"}'

# Response:
# {
#   "error": "Invalid YouTube URL",
#   "code": "INVALID_YOUTUBE_URL"
# }
```

### Example 3: Authentication Required

```bash
# Missing authorization header
curl http://localhost:3000/api/transcribe \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'

# Response:
# {
#   "error": "Missing authorization header",
#   "code": "MISSING_AUTH_HEADER"
# }
```

---

## CORS Support

The API supports Cross-Origin Resource Sharing (CORS) from all origins:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Timeouts

**Recommended timeouts:**
- Individual requests: 30 seconds
- Full transcription (submit to complete): 1 hour

---

## Support

- **Integration issues?** See `SHADOW_INTEGRATION.md`
- **Setup problems?** See `SETUP.md`
- **Deployment guide?** See `DEPLOYMENT_CHECKLIST.md`
