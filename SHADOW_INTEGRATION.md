# Shadow Bot Integration Guide

Complete API specification for integrating the YouTube Transcription Service with Shadow bot.

---

## Authentication

All Shadow requests must include a Bearer token in the `Authorization` header.

### Token Generation

The Bearer token is derived from the `API_KEY_SECRET` environment variable:

```env
API_KEY_SECRET=your_secret_api_key
```

### Usage

Include in every request:

```http
Authorization: Bearer your_secret_api_key
```

**Note:** Requests without valid authentication will return `401 Unauthorized`.

---

## API Endpoints

The transcription service exposes three core endpoints for Shadow integration:

### 1. Submit Transcription Job

**Endpoint:** `POST /api/transcribe`

**Purpose:** Submit a YouTube video URL for transcription

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "forceWhisper": false
}
```

**Parameters:**
- `url` (string, required): Full YouTube video URL
- `forceWhisper` (boolean, optional): Skip YouTube native tier, go directly to Whisper (default: false)

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

**Error Responses:**

400 Bad Request — Invalid URL:
```json
{
  "error": "Invalid YouTube URL",
  "code": "INVALID_YOUTUBE_URL"
}
```

401 Unauthorized — Missing/invalid authentication:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

429 Too Many Requests — Rate limit exceeded:
```json
{
  "error": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

---

### 2. Check Transcription Status

**Endpoint:** `GET /api/status/{jobId}`

**Purpose:** Poll the status of a submitted transcription job

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer <api_key>
```

**Example:**
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/status/job_1739883000123_abc123
```

**Response (Queued - 200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "queued",
  "state": "waiting",
  "position": 3,
  "estimatedWait": "5-15 minutes depending on queue size"
}
```

**Response (Processing - 200 OK):**
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

**Response (Complete - 200 OK):**
```json
{
  "jobId": "job_1739883000123_abc123",
  "status": "complete",
  "videoId": "dQw4w9WgXcQ",
  "resultsUrl": "/api/transcript/dQw4w9WgXcQ",
  "completedAt": "2026-02-18T10:15:30.000Z"
}
```

**Response (Failed - 200 OK):**
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

**Error Responses:**

401 Unauthorized:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

404 Not Found — Job doesn't exist:
```json
{
  "error": "Job not found",
  "code": "JOB_NOT_FOUND",
  "jobId": "job_1739883000123_abc123"
}
```

---

### 3. Retrieve Completed Transcript

**Endpoint:** `GET /api/transcript/{videoId}`

**Purpose:** Fetch the complete transcription result (available after job completes)

**Authentication:** Required (Bearer token)

**Request Headers:**
```
Authorization: Bearer <api_key>
```

**Example:**
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/api/transcript/dQw4w9WgXcQ
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
  "transcriptUrl": "https://barkstech-media.sfo3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.txt",
  "transcriptJsonUrl": "https://barkstech-media.sfo3.digitaloceanspaces.com/transcripts/dQw4w9WgXcQ/transcript.json",
  "metadata": {
    "duration": "3:33",
    "language": "en",
    "downloadedAt": "2026-02-18T10:15:00Z",
    "tier": 1
  }
}
```

**Error Responses:**

401 Unauthorized:
```json
{
  "error": "Invalid API key",
  "code": "INVALID_API_KEY"
}
```

404 Not Found — Transcript not available:
```json
{
  "error": "Transcript not found for this video ID",
  "code": "TRANSCRIPT_NOT_FOUND",
  "videoId": "dQw4w9WgXcQ",
  "hint": "Submit a new transcription job via POST /api/transcribe"
}
```

---

## Rate Limiting

Rate limits are applied per IP address to prevent abuse.

**Headers included in all responses:**
```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 1645200600
```

**Limits:**
- **Transcribe endpoint:** 100 requests per 15 minutes (unauthenticated)
- **Authenticated requests (Shadow):** Skipped (no limit)
- **Global limit:** 100 requests per minute (all endpoints)

**When exceeded (429 Too Many Requests):**
```json
{
  "error": "Too many requests, please try again later",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 900
}
```

The `retryAfter` value is in seconds.

---

## Processing Tiers

The service automatically attempts transcription using a 3-tier strategy:

### Tier 1: YouTube Native (Instant)
- **Speed:** <1 second
- **Quality:** Highest (99%+ accuracy)
- **Coverage:** ~60% of videos have native captions
- **Fallback:** Automatic if unavailable

### Tier 2: OpenAI Whisper (Fallback)
- **Speed:** 10-15 minutes per hour of video
- **Quality:** High (~95% accuracy)
- **Coverage:** Works for any video
- **Model:** Configurable (small, base, medium, large)

### Tier 3: Force Whisper
- **Usage:** Set `forceWhisper: true` in request
- **Purpose:** Bypass native tier for specific use cases
- **Processing time:** Same as Tier 2

---

## Python Integration Example

Complete example for integrating with Shadow using Python:

```python
import requests
import time
from typing import Optional

class TranscriptionClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def submit(self, url: str, force_whisper: bool = False) -> dict:
        """Submit a video for transcription"""
        payload = {
            'url': url,
            'forceWhisper': force_whisper
        }
        
        response = requests.post(
            f'{self.api_url}/api/transcribe',
            json=payload,
            headers=self.headers,
            timeout=10
        )
        
        if response.status_code != 202:
            raise Exception(f"Failed to submit job: {response.text}")
        
        return response.json()
    
    def status(self, job_id: str) -> dict:
        """Check the status of a job"""
        response = requests.get(
            f'{self.api_url}/api/status/{job_id}',
            headers=self.headers,
            timeout=10
        )
        
        if response.status_code != 200:
            raise Exception(f"Failed to get status: {response.text}")
        
        return response.json()
    
    def transcript(self, video_id: str) -> dict:
        """Retrieve a completed transcript"""
        response = requests.get(
            f'{self.api_url}/api/transcript/{video_id}',
            headers=self.headers,
            timeout=10
        )
        
        if response.status_code != 200:
            raise Exception(f"Failed to get transcript: {response.text}")
        
        return response.json()
    
    def wait_for_completion(self, job_id: str, max_wait_seconds: int = 3600) -> Optional[dict]:
        """Poll until transcription completes"""
        start_time = time.time()
        poll_interval = 5  # Start with 5 seconds
        
        while time.time() - start_time < max_wait_seconds:
            status = self.status(job_id)
            
            if status['status'] == 'complete':
                return status
            elif status['status'] == 'failed':
                raise Exception(f"Job failed: {status.get('error')}")
            
            print(f"Status: {status['status']} - {status.get('stage', 'processing')}")
            
            # Increase poll interval over time
            time.sleep(poll_interval)
            poll_interval = min(poll_interval + 5, 30)
        
        raise TimeoutError(f"Transcription did not complete within {max_wait_seconds} seconds")


# Usage Example
if __name__ == "__main__":
    client = TranscriptionClient(
        api_url='http://localhost:3000',
        api_key='your_api_key_here'
    )
    
    # Submit a video
    print("Submitting video for transcription...")
    result = client.submit('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    job_id = result['jobId']
    video_id = result['videoId']
    print(f"Job submitted: {job_id}")
    
    # Wait for completion
    print("Waiting for transcription to complete...")
    completed = client.wait_for_completion(job_id)
    print(f"Transcription complete!")
    
    # Get transcript
    print("Retrieving transcript...")
    transcript = client.transcript(video_id)
    print(f"Title: {transcript['title']}")
    print(f"Source: {transcript['source']}")
    print(f"Transcript URL: {transcript['transcriptUrl']}")
```

---

## Common Shadow Integration Patterns

### Pattern 1: Fire and Forget (Webhook Callback)
```python
# Submit job and store job_id for later webhook callback
job = client.submit(url)
store_in_database(video_url, job['jobId'])

# Later, when webhook arrives with completion notification:
transcript = client.transcript(video_id)
process_transcript(transcript)
```

### Pattern 2: Polling with Exponential Backoff
```python
# Poll with increasing intervals
job = client.submit(url)
max_polls = 120
poll_interval = 5

for i in range(max_polls):
    status = client.status(job['jobId'])
    if status['status'] == 'complete':
        transcript = client.transcript(video_id)
        break
    
    time.sleep(poll_interval)
    poll_interval = min(poll_interval * 1.5, 60)
```

### Pattern 3: Batch Processing
```python
# Submit multiple videos
jobs = []
for url in video_urls:
    job = client.submit(url)
    jobs.append(job)

# Poll all jobs periodically
completed = {}
while len(completed) < len(jobs):
    for job in jobs:
        if job['jobId'] not in completed:
            status = client.status(job['jobId'])
            if status['status'] == 'complete':
                transcript = client.transcript(job['videoId'])
                completed[job['jobId']] = transcript
    
    time.sleep(30)  # Check every 30 seconds
```

---

## Error Handling Best Practices

1. **Check response status code** before processing response body
2. **Implement exponential backoff** for rate limit retries
3. **Store job IDs** to enable recovery if connection drops
4. **Log all errors** with timestamp and job ID for debugging
5. **Set reasonable timeouts** (30-60 seconds for individual requests, 1 hour for full processing)
6. **Handle 429 errors gracefully** by respecting `retryAfter` header

Example error handler:
```python
def safe_submit(client, url, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.submit(url)
        except Exception as e:
            if 'RATE_LIMIT_EXCEEDED' in str(e):
                wait_time = min(60 * (2 ** attempt), 600)  # Max 10 minutes
                print(f"Rate limited, waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                print(f"Error submitting job: {e}")
                raise
    
    raise Exception(f"Failed to submit after {max_retries} retries")
```

---

## Monitoring and Debugging

### Health Check
```bash
curl -H "Authorization: Bearer your_api_key" \
  http://localhost:3000/health
```

### View Logs
```bash
# Docker
docker-compose logs -f app

# Local
tail -f /path/to/logs/transcription.log
```

### Debug a Failed Job
```python
job = client.status(job_id)
print(f"Error: {job.get('error')}")
print(f"Attempts: {job.get('attempts')}")
print(f"Failed at: {job.get('failedAt')}")
```

---

## Support & Troubleshooting

- **API documentation:** See `API_REFERENCE.md`
- **Setup issues:** See `SETUP.md`
- **Deployment:** See `DEPLOYMENT_CHECKLIST.md`
