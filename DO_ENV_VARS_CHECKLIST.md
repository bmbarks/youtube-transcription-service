# DigitalOcean App Platform Environment Variables Checklist

**Generated:** 2026-02-18  
**Git Commit:** `cbad353`  
**Status:** Code pushed to main → Auto-deploy should trigger

---

## ✅ Code Changes Made (This Commit)

**Files Updated:**
- `transcription-app.yaml` - DO_SPACES_REGION: nyc3 → sfo3, DO_SPACES_ENDPOINT updated
- `docker-compose.yml` - Same region/endpoint updates
- `.env.example` - Template updated
- `.env.test` - Test config updated
- `routes/transcript.js` - Example URLs in comments updated
- `API_REFERENCE.md` - Documentation examples updated
- `SETUP.md` - Documentation updated
- `SHADOW_INTEGRATION.md` - Documentation updated
- `DEPLOYMENT_CHECKLIST.md` - Documentation updated

**Code Already Correct:**
- ✅ `WHISPER_MODEL` (code expects this, NOT WHISPER_MODEL_SIZE)
- ✅ `WORKER_CONCURRENCY` (code expects this, NOT MAX_CONCURRENT_JOBS)
- ✅ `WORKER_TIMEOUT_MS` (code expects this, NOT JOB_TIMEOUT_MS)

---

## 🗑️ ENV VARS TO REMOVE FROM DO CONSOLE

These variables are **NOT referenced anywhere in the code** and should be deleted:

| Variable | Reason |
|----------|--------|
| `HF_TOKEN` | Not used - faster-whisper doesn't need HuggingFace token |
| `MODEL_PRELOAD` | Not used - no preload logic in codebase |
| `CACHE_TTL_SECONDS` | Not used - no cache TTL config in codebase |
| `WHISPER_MODEL_SIZE` | Wrong name - code uses `WHISPER_MODEL` |
| `MAX_CONCURRENT_JOBS` | Wrong name - code uses `WORKER_CONCURRENCY` |
| `JOB_TIMEOUT_MS` | Wrong name - code uses `WORKER_TIMEOUT_MS` |

---

## ✏️ ENV VARS TO RENAME/UPDATE

If you have these old names in DO, rename them:

| Old Name (DELETE) | New Name (ADD) | Value |
|-------------------|----------------|-------|
| `WHISPER_MODEL_SIZE` | `WHISPER_MODEL` | `small` |
| `MAX_CONCURRENT_JOBS` | `WORKER_CONCURRENCY` | `1` |
| `JOB_TIMEOUT_MS` | `WORKER_TIMEOUT_MS` | `3600000` |

---

## 📋 COMPLETE ENV VAR LIST (What DO Should Have)

### Required (must be set):

| Variable | Type | Value/Notes |
|----------|------|-------------|
| `REDIS_URL` | SECRET | Auto-populated by DO if using managed Redis |
| `DO_SPACES_KEY` | SECRET | Your Spaces access key |
| `DO_SPACES_SECRET` | SECRET | Your Spaces secret key |
| `DO_SPACES_REGION` | String | `sfo3` |
| `DO_SPACES_BUCKET` | String | `barkstech-media` |
| `DO_SPACES_ENDPOINT` | String | `https://sfo3.digitaloceanspaces.com` |
| `API_KEY_SECRET` | SECRET | Shadow bot's API key |

### Optional (with defaults):

| Variable | Type | Default | Recommended |
|----------|------|---------|-------------|
| `NODE_ENV` | String | development | `production` |
| `PORT` | String | 3000 | `3000` |
| `WHISPER_MODEL` | String | small | `small` |
| `WHISPER_DEVICE` | String | cpu | `cpu` |
| `WORKER_CONCURRENCY` | String | 1 | `1` |
| `WORKER_TIMEOUT_MS` | String | 3600000 | `3600000` (1 hour) |
| `LOG_LEVEL` | String | info | `info` |
| `ENABLE_YOUTUBE_TIER` | String | true | `true` |
| `ENABLE_WHISPER_TIER` | String | true | `true` |
| `ENABLE_FALLBACK` | String | true | `true` |

---

## 📝 STEP-BY-STEP DO CONSOLE INSTRUCTIONS

### 1. Open DO App Platform Console
1. Go to [cloud.digitalocean.com](https://cloud.digitalocean.com)
2. Click **Apps** in left sidebar
3. Click on **youtube-transcription-service**

### 2. Navigate to Environment Variables
1. Click **Settings** tab (top nav)
2. Scroll down to **App-Level Environment Variables** section
3. Or click **Components** → **app** → **Environment Variables**

### 3. Delete Unused Variables
For each of these (if present), click the **trash icon** to delete:
- [ ] `HF_TOKEN`
- [ ] `MODEL_PRELOAD`
- [ ] `CACHE_TTL_SECONDS`
- [ ] `WHISPER_MODEL_SIZE` (if present, replace with WHISPER_MODEL)
- [ ] `MAX_CONCURRENT_JOBS` (if present, replace with WORKER_CONCURRENCY)
- [ ] `JOB_TIMEOUT_MS` (if present, replace with WORKER_TIMEOUT_MS)

### 4. Verify/Update These Variables
Check each exists with correct value:

**CRITICAL - Region Fix:**
- [ ] `DO_SPACES_REGION` = `sfo3` (NOT nyc3)
- [ ] `DO_SPACES_ENDPOINT` = `https://sfo3.digitaloceanspaces.com`

**Secrets (should already be set):**
- [ ] `REDIS_URL` = (should be auto-linked to redis-db)
- [ ] `DO_SPACES_KEY` = (your key)
- [ ] `DO_SPACES_SECRET` = (your secret)
- [ ] `API_KEY_SECRET` = (Shadow's key)

**Add if missing:**
- [ ] `WHISPER_MODEL` = `small`
- [ ] `WORKER_CONCURRENCY` = `1`
- [ ] `WORKER_TIMEOUT_MS` = `3600000`

### 5. Save & Deploy
1. Click **Save** after making changes
2. This should auto-trigger a new deployment
3. Watch the deployment logs for any errors

### 6. Verify Deployment
After deploy completes:
```bash
# Test health endpoint
curl https://your-app-url.ondigitalocean.app/health

# Expected response:
# {"status":"healthy","timestamp":"...","services":{"redis":"connected"}}
```

---

## 🚨 IMPORTANT NOTES

1. **The git push already happened** - DO should auto-deploy from the yaml file changes
2. **DO console overrides YAML** - If you set env vars in DO console, they take precedence over yaml
3. **Region matters** - Your Spaces bucket is in `sfo3`, endpoint must match
4. **Redis auto-links** - If using DO managed Redis, REDIS_URL is auto-populated

---

## Quick Reference: Before → After

```
BEFORE (Broken)                    AFTER (Fixed)
─────────────────────             ─────────────────────
WHISPER_MODEL_SIZE=small    →     WHISPER_MODEL=small
MAX_CONCURRENT_JOBS=1       →     WORKER_CONCURRENCY=1
JOB_TIMEOUT_MS=3600000      →     WORKER_TIMEOUT_MS=3600000
DO_SPACES_REGION=nyc3       →     DO_SPACES_REGION=sfo3
DO_SPACES_ENDPOINT=nyc3...  →     DO_SPACES_ENDPOINT=sfo3...

DELETE (unused):
- HF_TOKEN
- MODEL_PRELOAD  
- CACHE_TTL_SECONDS
```
