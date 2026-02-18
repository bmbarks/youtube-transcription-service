FROM node:18-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages (pre-compiled wheels on Debian)
RUN pip3 install --no-cache-dir \
    setuptools \
    wheel \
    yt-dlp \
    openai-whisper

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "server.js"]
