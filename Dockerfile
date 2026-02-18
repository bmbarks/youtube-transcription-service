# Optimized Dockerfile for YouTube Transcription Service
# Uses faster-whisper (CTranslate2) instead of openai-whisper (PyTorch)
# Image size: ~800MB (vs 4GB+ with GPU PyTorch)
# Build time: ~90 seconds

FROM python:3.11-slim-bookworm

# System dependencies (minimal footprint)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install Python packages (faster-whisper uses CTranslate2, NOT PyTorch)
# This avoids the 3GB+ PyTorch CUDA bloat entirely
RUN pip3 install --no-cache-dir \
    faster-whisper \
    yt-dlp

# Install Node.js 18 (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Pre-download the whisper model during build (avoids runtime download delay)
# Using 'small' model for quality/speed balance
RUN python3 -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create temp directories for audio processing
RUN mkdir -p /tmp/whisper

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "server.js"]
