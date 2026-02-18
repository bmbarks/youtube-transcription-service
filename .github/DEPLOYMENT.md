# YouTube Transcription Service - Deployment Guide

## Overview

This service requires YouTube cookies to bypass bot detection. **Cookies are NEVER committed to git** - they're mounted at runtime via Docker volumes.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DigitalOcean Droplet                      │
├─────────────────────────────────────────────────────────────┤
│  /opt/youtube-transcription-service/                        │
│  ├── cookies/                    ← Volume mount point       │
│  │   └── youtube_cookies.txt     ← Your cookies (gitignored)│
│  ├── docker-compose.yml          ← Mounts ./cookies:/app/cookies
│  └── ...                                                    │
└─────────────────────────────────────────────────────────────┘
```

## Cookie Strategy

### Why Cookies Are Required
YouTube aggressively blocks automated access. Cookies from a logged-in browser session allow yt-dlp to act as an authenticated user, bypassing rate limits and bot detection.

### How It Works
1. **Cookies file lives on the server** at `/opt/youtube-transcription-service/cookies/youtube_cookies.txt`
2. **Docker mounts this directory** into the container at `/app/cookies`
3. **yt-dlp uses the cookies** via `--cookies /app/cookies/youtube_cookies.txt`
4. **Git never sees the file** - `cookies/` is in `.gitignore`

## Deployment Steps

### Initial Setup (First Time)

```bash
# SSH into droplet
ssh root@your-droplet-ip

# Navigate to service directory
cd /opt/youtube-transcription-service

# Create cookies directory
mkdir -p cookies

# Create cookies file (paste from export)
nano cookies/youtube_cookies.txt
# Paste Netscape HTTP Cookie format, save with Ctrl+O, Ctrl+X
```

### Getting Fresh Cookies

Use the **Get cookies.txt LOCALLY** Chrome extension or similar:

1. Open Chrome, log into YouTube
2. Click the extension icon on youtube.com
3. Click "Export" to get Netscape format cookies
4. Copy the contents

### Uploading Cookies to Server

```bash
# Option 1: SCP from local machine
scp ~/Downloads/youtube_cookies.txt root@your-droplet-ip:/opt/youtube-transcription-service/cookies/

# Option 2: Paste directly on server
ssh root@your-droplet-ip
cat > /opt/youtube-transcription-service/cookies/youtube_cookies.txt << 'EOF'
# Paste your cookies here, then type EOF and press Enter
EOF
```

### After Updating Cookies

```bash
# Restart the service to pick up new cookies
cd /opt/youtube-transcription-service
docker-compose restart

# Verify cookie health
curl http://localhost:3000/api/cookie-status
# Should return: {"cookiesLoaded": true, "cookieCount": 111, ...}
```

## Cookie Refresh Schedule

| Frequency | Recommended | Why |
|-----------|-------------|-----|
| Weekly | ✅ Yes | YouTube session cookies expire ~7 days |
| When failures spike | ✅ Yes | Bot detection triggered = refresh time |
| Monthly | ❌ Too rare | Will cause intermittent failures |

### Signs Cookies Need Refresh
- Transcription requests returning "Sign in to confirm" errors
- `/api/cookie-status` shows `cookiesValid: false`
- Spike in Tier 2 (Whisper) fallback usage

## Git Workflow (Safe Pushes)

```bash
# Normal development workflow - cookies never touched
git add .
git commit -m "feat: your feature"
git push origin main  # ✅ Safe - cookies not in history

# If you accidentally add cookies:
git reset HEAD cookies/
git checkout -- cookies/
# Then proceed with normal commit
```

## Security Checklist

- [x] `cookies/` in `.gitignore`
- [x] No cookies in git history (verified clean)
- [x] Cookies mounted via Docker volume (not copied into image)
- [x] Remote URL uses HTTPS (no embedded tokens)
- [ ] Rotate cookies weekly (manual task)

## Troubleshooting

### "Push rejected - secret scanning"
This should never happen now. If it does:
1. Check that `cookies/` is still in `.gitignore`
2. Run `git status` - cookies folder should not appear
3. If cookies were committed, contact lead for git history cleanup

### "Cookie file not found"
```bash
# Check the file exists
ls -la /opt/youtube-transcription-service/cookies/

# Check docker-compose.yml has the volume mount
grep -A5 "volumes:" docker-compose.yml
# Should show: - ./cookies:/app/cookies
```

### "Cookies invalid/expired"
1. Get fresh cookies from browser (see above)
2. Upload to server
3. `docker-compose restart`
4. Verify with `/api/cookie-status`

---

## Quick Reference

| Task | Command |
|------|---------|
| Check cookie status | `curl localhost:3000/api/cookie-status` |
| View logs | `docker-compose logs -f app` |
| Restart service | `docker-compose restart` |
| Full redeploy | `git pull && docker-compose up -d --build` |

---

*Last updated: 2026-02-18*  
*Maintainer: Stratton 🦞 (AI Director of Ops)*
