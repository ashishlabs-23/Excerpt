---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Deployment Architecture

This document specifies the deployment infrastructure, container configurations, and environment requirements.

---

## 1. Hosting & Infrastructure Targets

- **API & Worker Services**: Deployed as containerized services on Render using [`Dockerfile`](file:///c:/Projects/Ashishlabs/Excerpt/Dockerfile) and [`render.yaml`](file:///c:/Projects/Ashishlabs/Excerpt/render.yaml).
- **Web Application**: Deployed on Netlify / Vercel with Next.js edge runtime configurations.
- **Database**: Managed Supabase PostgreSQL with automated schema migrations.
- **Object Storage**: Backblaze B2 S3-compatible cloud storage.

---

## 2. Container Environment Requirements

The production container image requires:
1. **Node.js 20+**: Runtime for Express API and TypeScript worker pipelines.
2. **FFmpeg 6.0+ with libass**: Essential for video transcoding, subtitle burning, and hardware filter acceleration.
3. **yt-dlp**: Up-to-date media extraction engine with rotating cookie authentication strategy.
4. **Python 3.10+**: Runtime for specialized ML inference scripts where needed.

---

## 3. Deployment Runbook & Migrations

```bash
# 1. Apply Supabase database migrations
npx supabase db push

# 2. Build production containers
docker build -t excerpt-api:latest -f Dockerfile .

# 3. Health check verification
curl -f http://localhost:4000/health
```
