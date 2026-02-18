# Deployment Checklist

Production deployment verification guide for the YouTube Transcription Service.

---

## Pre-Deployment Verification

Complete all checks before deploying to production.

### Code Quality

- [ ] **All dependencies updated**
  ```bash
  npm audit
  npm update
  ```
  
- [ ] **No console.log statements** (use logger instead)
  ```bash
  grep -r "console\." src/  # Should be empty
  ```

- [ ] **Error handling in place**
  - All async functions wrapped with try/catch
  - All promises have `.catch()` handlers
  - 500 errors include error codes

- [ ] **Security checks**
  - No hardcoded secrets in code
  - All `.env` variables used correctly
  - API keys never logged
  - CORS properly configured
  - Rate limiting enabled

### Environment Configuration

- [ ] **Production `.env` file created** (never commit)
  ```bash
  cp .env.example .env.production
  # Edit with production credentials
  ```

- [ ] **All required variables present**
  ```bash
  NODE_ENV=production
  PORT=3000
  REDIS_URL=redis://prod-redis:6379
  DO_SPACES_KEY=<production_key>
  DO_SPACES_SECRET=<production_secret>
  DO_SPACES_BUCKET=<production_bucket>
  API_KEY_SECRET=<strong_random_key>
  WHISPER_MODEL=small  # or base for speed
  WHISPER_DEVICE=cpu
  LOG_LEVEL=info  # Not debug
  WORKER_CONCURRENCY=1
  ```

- [ ] **Secrets are strong**
  ```bash
  # Generate strong API key
  openssl rand -base64 32
  ```

### Database & Storage

- [ ] **DigitalOcean Spaces bucket created**
  - Bucket name verified
  - Region set to production location (e.g., nyc3)
  - Access keys generated and stored securely
  
- [ ] **Bucket has CORS policy**
  ```json
  {
    "CORSRules": [
      {
        "AllowedMethods": ["GET", "PUT", "POST"],
        "AllowedOrigins": ["*"],
        "AllowedHeaders": ["*"],
        "MaxAgeSeconds": 3000
      }
    ]
  }
  ```

- [ ] **Redis configured for production**
  - [ ] Persistence enabled (`appendonly yes`)
  - [ ] Password set (if accessible from network)
  - [ ] Backups scheduled daily
  - [ ] Max memory policy set: `maxmemory-policy allkeys-lru`
  - [ ] Replication configured (for failover)

### Monitoring & Logging

- [ ] **Logging configured**
  - Log level: `info` (not debug)
  - Logs written to file: `/var/log/transcription-service/`
  - Log rotation configured (daily, max 7 days)
  - JSON format enabled for parsing

- [ ] **Monitoring tools set up**
  - [ ] Health check endpoint monitored: `GET /health`
  - [ ] Alert on 503 status (Redis disconnect)
  - [ ] Alert on high error rate (>5% 5xx in 5 min window)
  - [ ] Alert on slow response time (>30s)
  - [ ] Dashboard showing queue depth

- [ ] **Metrics collection**
  - Queue size tracked
  - Job success/failure ratio
  - Average processing time per tier
  - API response times

---

## DigitalOcean Setup

### Create Droplet

- [ ] **Instance created**
  - Image: Ubuntu 22.04 LTS
  - Size: s-2vcpu-4gb (minimum for Whisper)
  - Region: nyc3 (same as Spaces bucket)
  - Backups: Enabled

- [ ] **Initial configuration**
  ```bash
  # SSH into droplet
  ssh root@<droplet_ip>
  
  # Update system
  sudo apt-get update && sudo apt-get upgrade -y
  
  # Install Node.js 18+
  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
  sudo apt-get install -y nodejs
  
  # Install Redis
  sudo apt-get install -y redis-server
  
  # Install FFmpeg & Python
  sudo apt-get install -y ffmpeg python3-pip
  
  # Install Whisper
  pip3 install openai-whisper
  
  # Verify installations
  node --version && redis-server --version && ffmpeg -version
  ```

- [ ] **Firewall configured**
  ```bash
  sudo ufw enable
  sudo ufw allow 22/tcp      # SSH
  sudo ufw allow 80/tcp      # HTTP
  sudo ufw allow 443/tcp     # HTTPS
  sudo ufw allow 6379/tcp    # Redis (internal only)
  ```

- [ ] **SSL certificate obtained** (if using HTTPS)
  ```bash
  sudo apt-get install -y certbot python3-certbot-nginx
  sudo certbot certonly --standalone -d yourdomain.com
  ```

### Deploy Application

- [ ] **Application cloned**
  ```bash
  cd /opt
  sudo git clone <repository_url> transcription-service
  cd transcription-service
  npm install
  ```

- [ ] **Environment file created**
  ```bash
  sudo cp .env.example .env.production
  sudo nano .env.production  # Edit with production values
  
  # Set permissions
  sudo chmod 600 .env.production
  sudo chown nobody:nogroup .env.production
  ```

- [ ] **Systemd service created**
  Create `/etc/systemd/system/transcription-service.service`:
  ```ini
  [Unit]
  Description=YouTube Transcription Service
  After=network.target redis-server.service
  
  [Service]
  Type=simple
  User=nobody
  WorkingDirectory=/opt/transcription-service
  ExecStart=/usr/bin/node server.js
  Restart=on-failure
  RestartSec=10
  StandardOutput=journal
  StandardError=journal
  Environment=NODE_ENV=production
  EnvironmentFile=/opt/transcription-service/.env.production
  
  [Install]
  WantedBy=multi-user.target
  ```

- [ ] **Redis configured for production**
  Edit `/etc/redis/redis.conf`:
  ```conf
  appendonly yes
  appendfsync everysec
  maxmemory 2gb
  maxmemory-policy allkeys-lru
  ```

- [ ] **Services started and enabled**
  ```bash
  sudo systemctl start redis-server
  sudo systemctl enable redis-server
  sudo systemctl start transcription-service
  sudo systemctl enable transcription-service
  sudo systemctl status transcription-service
  ```

- [ ] **Log files configured**
  ```bash
  sudo mkdir -p /var/log/transcription-service
  sudo chown nobody:nogroup /var/log/transcription-service
  
  # Add to .env.production
  LOG_FILE=/var/log/transcription-service/app.log
  ```

### Configure Reverse Proxy (Nginx)

- [ ] **Nginx installed and configured**
  Create `/etc/nginx/sites-available/transcription-service`:
  ```nginx
  upstream transcription {
    server localhost:3000;
  }
  
  server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
  }
  
  server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    # Compression
    gzip on;
    gzip_types text/plain application/json;
    
    location / {
      proxy_pass http://transcription;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
      
      # Timeouts for long-running requests
      proxy_connect_timeout 30s;
      proxy_send_timeout 3600s;
      proxy_read_timeout 3600s;
    }
  }
  ```

- [ ] **Enable site and restart Nginx**
  ```bash
  sudo ln -s /etc/nginx/sites-available/transcription-service /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl restart nginx
  ```

---

## Health Verification

### Local Health Check

- [ ] **Service responding**
  ```bash
  curl https://yourdomain.com/health
  ```
  Expected response:
  ```json
  {
    "status": "ok",
    "redis": "connected",
    "uptime": 123.45,
    "timestamp": "2026-02-18T10:30:00Z"
  }
  ```

- [ ] **Redis connected**
  ```bash
  redis-cli ping  # Should respond: PONG
  redis-cli info stats  # Check activity
  ```

- [ ] **Logs clean**
  ```bash
  sudo tail -50 /var/log/transcription-service/app.log
  # Should show: service started, health checks, no errors
  ```

### API Health Check

- [ ] **Test transcription endpoint**
  ```bash
  curl -X POST https://yourdomain.com/api/transcribe \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
  ```
  Expected response (202):
  ```json
  {
    "jobId": "job_...",
    "videoId": "dQw4w9WgXcQ",
    "status": "queued",
    "statusUrl": "/api/status/job_..."
  }
  ```

- [ ] **Monitor job processing**
  ```bash
  # Extract jobId from response, then:
  curl -H "Authorization: Bearer YOUR_API_KEY" \
    https://yourdomain.com/api/status/{jobId}
  ```

- [ ] **Retrieve transcript** (after job completes)
  ```bash
  curl -H "Authorization: Bearer YOUR_API_KEY" \
    https://yourdomain.com/api/transcript/dQw4w9WgXcQ
  ```

### Load Testing

- [ ] **Performance baseline established**
  ```bash
  # Using Apache Bench
  ab -n 100 -c 10 https://yourdomain.com/health
  
  # Using hey
  hey -n 100 -c 10 https://yourdomain.com/health
  ```
  Target: <200ms response time for health check

- [ ] **Rate limiting verified**
  ```bash
  # Submit 150 requests in 15 minutes (should trigger limit at 100)
  for i in {1..150}; do
    curl -H "Authorization: Bearer KEY" \
      https://yourdomain.com/api/transcribe ...
  done
  ```

---

## Monitoring Setup

### Application Monitoring

- [ ] **PM2 installed** (process manager)
  ```bash
  npm install -g pm2
  pm2 start server.js --name "transcription" --env production
  pm2 save
  pm2 startup  # Enable auto-start
  ```

- [ ] **Error tracking configured**
  - [ ] Sentry integration (optional)
  - [ ] Email alerts on 500 errors
  - [ ] Log aggregation (Datadog, ELK, etc.)

### Redis Monitoring

- [ ] **Redis Commander installed** (web dashboard)
  ```bash
  npm install -g redis-commander
  redis-commander --port 8081 &
  ```
  Access at: `http://localhost:8081` (internal only)

- [ ] **Queue depth monitored**
  ```bash
  redis-cli -c "XLEN bull:transcription:jobs"
  ```

### Uptime Monitoring

- [ ] **Ping service set up**
  - Uptime robot: https://uptimerobot.com
  - Monitor endpoint: `https://yourdomain.com/health`
  - Check interval: Every 5 minutes
  - Alert on downtime >5 minutes

---

## Security Hardening

- [ ] **Secrets secured**
  - [ ] API keys stored in `.env.production` (not in git)
  - [ ] `.env` file chmod 600
  - [ ] DigitalOcean token stored securely
  - [ ] Backup encryption enabled

- [ ] **Network security**
  - [ ] SSH key authentication (no password)
  - [ ] Firewall rules restrictive
  - [ ] Redis binds to localhost only
  - [ ] HTTPS enforced (redirect 80→443)

- [ ] **Application security**
  - [ ] CORS configured appropriately
  - [ ] Rate limiting enabled
  - [ ] No debug mode in production
  - [ ] Error messages don't leak secrets

---

## Backup & Recovery

### Backup Strategy

- [ ] **Daily backups scheduled**
  ```bash
  # Redis dump
  0 2 * * * redis-cli bgsave && cp /var/lib/redis/dump.rdb /backup/redis-$(date +\%Y\%m\%d).rdb
  
  # Application code
  0 3 * * * tar -czf /backup/app-$(date +\%Y\%m\%d).tar.gz /opt/transcription-service
  
  # Logs
  0 4 * * * tar -czf /backup/logs-$(date +\%Y\%m\%d).tar.gz /var/log/transcription-service
  ```

- [ ] **Backups stored off-server**
  - [ ] DigitalOcean Spaces backups
  - [ ] Or rsync to backup server

- [ ] **Backup tested**
  ```bash
  # Verify backup can be restored
  cd /tmp && tar -xzf /backup/app-20260218.tar.gz
  # Should extract without errors
  ```

### Rollback Procedure

If deployment fails:

1. **Stop current service**
   ```bash
   sudo systemctl stop transcription-service
   ```

2. **Restore from backup**
   ```bash
   cd /opt
   sudo rm -rf transcription-service
   sudo tar -xzf /backup/app-<previous_date>.tar.gz
   ```

3. **Restart service**
   ```bash
   sudo systemctl start transcription-service
   sudo systemctl status transcription-service
   ```

4. **Verify health**
   ```bash
   curl https://yourdomain.com/health
   ```

---

## Post-Deployment

- [ ] **Service running**
  ```bash
  sudo systemctl status transcription-service  # Should be "active (running)"
  ```

- [ ] **Logs monitored** (first hour)
  ```bash
  sudo journalctl -u transcription-service -f
  ```

- [ ] **Team notified** of successful deployment

- [ ] **Documentation updated**
  - API endpoint URL
  - API key distribution
  - Monitoring dashboard URL

- [ ] **Shadow bot configured** with:
  - API endpoint: `https://yourdomain.com`
  - API key: From `.env.production`
  - See `SHADOW_INTEGRATION.md`

---

## Maintenance Schedule

### Daily
- [ ] Check application logs for errors
- [ ] Monitor queue depth (should be near 0)
- [ ] Verify health endpoint responsive

### Weekly
- [ ] Review error rate (should be <1%)
- [ ] Check Redis memory usage (should be <80% of max)
- [ ] Verify backups completed successfully

### Monthly
- [ ] Update dependencies: `npm audit`, `npm update`
- [ ] Test rollback procedure
- [ ] Review and optimize slow queries
- [ ] Update SSL certificates (if <30 days to expiration)

### Quarterly
- [ ] Full security audit
- [ ] Capacity planning (increase resources if needed)
- [ ] Disaster recovery drill

---

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u transcription-service -n 50

# Verify Redis running
redis-cli ping  # Should say PONG

# Check environment variables
sudo systemctl cat transcription-service | grep Environment
```

### High memory usage
```bash
# Check process
ps aux | grep node

# Reduce concurrency in .env
WORKER_CONCURRENCY=1

# Use smaller Whisper model
WHISPER_MODEL=base
```

### Queue backing up
```bash
# Check queue size
redis-cli -c "XLEN bull:transcription:jobs"

# Increase concurrency (if resources available)
WORKER_CONCURRENCY=2
```

### Jobs failing
```bash
# Check failed jobs
redis-cli -c "XRANGE bull:transcription:jobs -failed - COUNT 10"

# Check logs
sudo tail -100 /var/log/transcription-service/app.log | grep ERROR
```

---

## Support

- Setup issues: See `SETUP.md`
- API questions: See `API_REFERENCE.md`
- Shadow integration: See `SHADOW_INTEGRATION.md`
