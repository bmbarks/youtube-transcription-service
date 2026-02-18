# YouTube Transcription Service — Setup Guide

A 3-tier YouTube transcription service featuring:
- **Tier 1:** YouTube native transcripts (instant, high quality)
- **Tier 2:** OpenAI Whisper fallback (10-15 minutes, works for any video)
- **Architecture:** Express + Bull queue + Redis + DigitalOcean Spaces

---

## Prerequisites

### System Requirements
- **Node.js 18+** (required for ES modules and modern features)
- **Redis 6+** (in-memory queue backend)
- **FFmpeg** (audio/video processing)
- **yt-dlp** (YouTube downloader)
- **Python 3.10+** with OpenAI Whisper (for transcription fallback)

### Quick Check
```bash
node --version          # Verify Node.js 18+
redis-server --version  # Check Redis
ffmpeg -version        # Verify FFmpeg
yt-dlp --version       # Check yt-dlp
python3 -c "import whisper; print(whisper.__version__)"  # Whisper check
```

### Credentials Needed
- **DigitalOcean Spaces API keys** (for transcript storage)
  - Access Key
  - Secret Key
  - Bucket name & region
- **API Key Secret** (for Shadow bot integration)

---

## Quick Start (Docker Recommended)

### Option 1: Docker Compose (Fastest)

1. **Clone the repository:**
   ```bash
   cd /Users/clawds/.openclaw/workspace/youtube-transcription-service
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Add credentials to `.env`:**
   ```env
   # DigitalOcean Spaces (required)
   DO_SPACES_KEY=your_access_key
   DO_SPACES_SECRET=your_secret_key
   DO_SPACES_BUCKET=barkstech-media
   
   # API Security
   API_KEY_SECRET=your_shadow_api_key
   ```

4. **Start services:**
   ```bash
   docker-compose up
   ```

5. **Verify startup:**
   - Redis: `http://localhost:6379` (internal)
   - App: `http://localhost:3000`
   - Health check: `curl http://localhost:3000/health`
   - Web UI: Open `http://localhost:3000` in browser

6. **First transcription test:**
   ```bash
   curl -X POST http://localhost:3000/api/transcribe \
     -H "Content-Type: application/json" \
     -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
   ```

---

## Manual Setup (Local Development)

### Step 1: Install System Dependencies

#### macOS
```bash
# Install with Homebrew
brew install node redis ffmpeg python3

# Install yt-dlp
pip3 install yt-dlp

# Install Whisper
pip3 install openai-whisper
```

#### Linux (Ubuntu/Debian)
```bash
sudo apt-get update
sudo apt-get install -y nodejs redis-server ffmpeg python3-pip

# Install yt-dlp
pip3 install yt-dlp

# Install Whisper
pip3 install openai-whisper
```

#### Windows
- Download Node.js from https://nodejs.org/
- Download Redis for Windows from https://github.com/microsoftarchive/redis/releases
- Download FFmpeg from https://ffmpeg.org/download.html
- Install Python 3 from https://www.python.org/
- Run in PowerShell (as Admin):
  ```powershell
  pip install yt-dlp openai-whisper
  ```

### Step 2: Start Redis

```bash
# macOS/Linux
redis-server --port 6379 --daemonize yes

# Windows (if installed)
redis-server

# Verify connection
redis-cli ping  # Should respond: PONG
```

### Step 3: Install Node Dependencies

```bash
cd youtube-transcription-service
npm install
```

### Step 4: Configure Environment

```bash
# Copy example config
cp .env.example .env

# Edit with your credentials
nano .env  # or use your favorite editor
```

**Required variables:**
```env
NODE_ENV=development
PORT=3000
REDIS_URL=redis://localhost:6379

# DigitalOcean Spaces (required)
DO_SPACES_KEY=your_access_key
DO_SPACES_SECRET=your_secret_key
DO_SPACES_REGION=nyc3
DO_SPACES_BUCKET=barkstech-media
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com

# API Security (required)
API_KEY_SECRET=your_shadow_api_key_here

# Transcription (optional, defaults provided)
WHISPER_MODEL=small  # base, small, medium, large (larger = more accurate but slower)
WHISPER_DEVICE=cpu   # cpu or cuda (GPU if available)

# Rate limiting (optional)
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=900000
```

### Step 5: Start the Application

```bash
# Development mode (with auto-reload)
npm run dev

# Or production mode
npm start
```

Expected startup output:
```
[INFO] YouTube Transcription Service Starting
[INFO] YouTube Transcription Service listening on port 3000
[INFO] url: http://localhost:3000
[INFO] healthCheck: http://localhost:3000/health
```

### Step 6: Verify Health

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "redis": "connected",
  "uptime": 5.234,
  "timestamp": "2026-02-18T09:30:00.000Z"
}
```

---

## Generate API Key for Shadow

The API key is used by Shadow bot to authenticate requests to this service.

### Option 1: Use Environment Variable
The service automatically generates a Bearer token from the `API_KEY_SECRET` environment variable:

```bash
# Set in .env
API_KEY_SECRET=your_secret_key

# Shadow bot uses this in Authorization header:
# Authorization: Bearer your_secret_key
```

### Option 2: Generate Secure API Key
```bash
# Generate a random secure key (macOS/Linux)
openssl rand -base64 32

# Windows (PowerShell)
$Bytes = [System.Text.Encoding]::UTF8.GetBytes("seed")
$Random = New-Object System.Random
[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes([System.String]::Join("", (1..32 | % {[char]$Random.Next(33, 127)}))))
```

Store the generated key in `.env`:
```env
API_KEY_SECRET=generated_key_here
```

---

## Troubleshooting

### Redis Connection Failed

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# If not, start Redis
redis-server --port 6379 --daemonize yes

# Or with Docker
docker run -d -p 6379:6379 redis:7-alpine
```

### Python/Whisper Not Found

**Error:** `command not found: whisper` or `No module named 'whisper'`

**Solution:**
```bash
# Reinstall Whisper
pip3 install --upgrade openai-whisper

# Verify installation
python3 -c "import whisper; print(whisper.__version__)"
```

### FFmpeg Not Found

**Error:** `ffmpeg: command not found`

**Solution:**
```bash
# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg

# Windows: Download from https://ffmpeg.org/download.html
# Add to PATH manually
```

### yt-dlp Outdated

**Error:** `yt-dlp: ERROR: ERROR: No such file (like -1.0 seconds) to download`

**Solution:**
```bash
# Update yt-dlp
pip3 install --upgrade yt-dlp

# Verify
yt-dlp --version
```

### Docker Container Won't Start

**Error:** `failed to solve with frontend dockerfile.v0`

**Solution:**
```bash
# Clean up and rebuild
docker-compose down
docker-compose rm -f
docker-compose build --no-cache
docker-compose up
```

### High Memory Usage

**Issue:** Node process consuming >2GB RAM during Whisper processing

**Solutions:**
- Reduce `WHISPER_MODEL` size (use `small` or `base` instead of `large`)
- Reduce `WORKER_CONCURRENCY` (process 1 video at a time)
- Monitor with: `top` or `docker stats`

### Transcription Taking Too Long

**Tier 1 (YouTube native):** Should complete in <1 second
**Tier 2 (Whisper):** Typically 10-15 minutes for a 60-minute video

If processing is slower:
- Check CPU usage: `top` / `docker stats`
- Check disk space: `df -h`
- Verify `WHISPER_DEVICE=cpu` (GPU would be faster)
- Reduce `WHISPER_MODEL` for faster processing

### Out of Disk Space

**Error:** `No space left on device`

**Solution:**
```bash
# Check available space
df -h

# Clear old transcription files
rm -rf /tmp/whisper_*

# In Docker, increase container storage or mount volume
```

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | Server port |
| `REDIS_URL` | - | Redis connection URL (required) |
| `DO_SPACES_KEY` | - | DigitalOcean Spaces access key (required) |
| `DO_SPACES_SECRET` | - | DigitalOcean Spaces secret (required) |
| `DO_SPACES_BUCKET` | - | Bucket name (required) |
| `WHISPER_MODEL` | `small` | `base`, `small`, `medium`, `large` |
| `WHISPER_DEVICE` | `cpu` | `cpu` or `cuda` (GPU) |
| `API_KEY_SECRET` | `dev-secret` | Bearer token for Shadow bot |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 minutes) |
| `WORKER_CONCURRENCY` | `1` | Simultaneous transcriptions |

### Health Check Endpoint

**Endpoint:** `GET /health`

**Response (healthy):**
```json
{
  "status": "ok",
  "redis": "connected",
  "uptime": 123.456,
  "timestamp": "2026-02-18T09:30:00Z"
}
```

**Response (unhealthy):**
```json
{
  "status": "error",
  "redis": "disconnected",
  "error": "connect ECONNREFUSED 127.0.0.1:6379"
}
```

---

## Next Steps

1. **Submit your first transcription:**
   ```bash
   curl -X POST http://localhost:3000/api/transcribe \
     -H "Content-Type: application/json" \
     -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
   ```

2. **Monitor progress:**
   ```bash
   # Get job ID from response, then check status
   curl http://localhost:3000/api/status/{jobId}
   ```

3. **Retrieve transcript:**
   ```bash
   curl http://localhost:3000/api/transcript/{videoId}
   ```

4. **Integrate with Shadow bot:** See `SHADOW_INTEGRATION.md`

5. **Deploy to production:** See `DEPLOYMENT_CHECKLIST.md`

---

## Support

- **Issues with setup?** Check the Troubleshooting section above
- **API questions?** See `API_REFERENCE.md`
- **Ready to deploy?** See `DEPLOYMENT_CHECKLIST.md`
- **Integrating Shadow?** See `SHADOW_INTEGRATION.md`
