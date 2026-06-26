<div align="center">

<img src="https://img.shields.io/badge/Excerpt-AI%20Video%20Clipping-orange?style=for-the-badge&logo=youtube&logoColor=white" alt="Excerpt" />

# ✂️ Excerpt — AI Video Clipping Platform

**Transform long-form football videos into viral, publishable clips — automatically.**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Redis](https://img.shields.io/badge/Redis-Queue-DC382D?style=flat-square&logo=redis)](https://redis.io)
[![Netlify](https://img.shields.io/badge/Netlify-Deployed-00C7B7?style=flat-square&logo=netlify)](https://netlify.com)

[🚀 Live Demo](#) · [📖 Docs](#architecture) · [🐛 Report Bug](https://github.com/ashishlabs-23/Excerpt/issues)

</div>

---

## 🎯 What is Excerpt?

Excerpt is a **full-stack AI platform** that ingests YouTube match videos and automatically detects, cuts, captions, and publishes the most exciting moments — goals, counter-attacks, near-misses, saves — without any manual editing.

```
YouTube URL ──► AI Detection ──► Smart Cutting ──► Captions ──► Cloud Upload ──► Ready to Share
```

---

## ✨ Features

| Feature | Description |
|---|---|
| 🤖 **AI Clip Detection** | Neural pipeline detects key moments using Google AI & Groq |
| ✂️ **Smart Boundary Engine** | Learns from human editors to perfect clip start/end times |
| 🎙️ **Voiceover Studio** | Auto-generates sports commentary via ElevenLabs / Google TTS |
| 📊 **Editor Arena** | Human reviewers vote on clip quality to train the AI |
| 🏆 **Policy Tournament** | AB-tests clip boundaries to promote the best strategy |
| 📱 **Viral Format** | Clips optimised for TikTok / Instagram / YouTube Shorts |
| ⚡ **Real-time Updates** | Live progress via Supabase Realtime subscriptions |
| 🔐 **Auth & RLS** | Supabase Auth with Row Level Security per user |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Netlify)                    │
│              Next.js 14 · TypeScript · Tailwind          │
└────────────────────────┬────────────────────────────────┘
                         │ REST / Realtime
┌────────────────────────▼────────────────────────────────┐
│                  BACKEND API (Render)                    │
│              Node.js · Express · TypeScript              │
└──────────┬────────────────────────┬─────────────────────┘
           │                        │
    ┌──────▼──────┐        ┌────────▼────────┐
    │  Redis Queue │        │    Supabase DB   │
    │  BullMQ Jobs │        │  PostgreSQL+RLS  │
    └──────┬──────┘        └─────────────────┘
           │
    ┌──────▼──────────────────────────────────┐
    │           WORKER (Render)                │
    │  yt-dlp → FFmpeg → AI → Caption → B2    │
    └─────────────────────────────────────────┘
```

### Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Framer Motion, Supabase JS
- **Backend API**: Node.js, Express, TypeScript, BullMQ
- **Worker**: yt-dlp, FFmpeg, Google AI (Gemini), Groq, ElevenLabs
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Queue**: Redis (BullMQ)
- **Storage**: Backblaze B2 (S3-compatible)
- **Deployment**: Netlify (web) · Render (api + worker) · Upstash (Redis)

---

## 📁 Project Structure

```
Excerpt/
├── apps/
│   ├── web/                 # Next.js frontend (Netlify)
│   │   ├── src/
│   │   │   ├── app/         # App router pages
│   │   │   ├── components/  # UI components
│   │   │   └── lib/         # Supabase client, utils
│   │   └── netlify.toml
│   └── api/                 # Express API + Worker (Render)
│       ├── src/
│       │   ├── routes/      # API endpoints
│       │   ├── services/    # Supabase, B2, AI services
│       │   └── workers/     # BullMQ clip processing workers
│       └── scripts/         # Migration & preflight scripts
├── packages/                # Shared packages
├── supabase/
│   └── migrations/          # Database schema migrations
├── netlify.toml             # Frontend deployment config
├── render.yaml              # Backend deployment config
└── docker-compose.yml       # Local development stack
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Redis (local or [Upstash](https://upstash.com))
- [Supabase](https://supabase.com) project
- [Backblaze B2](https://backblaze.com) bucket
- FFmpeg installed locally
- yt-dlp installed locally

### 1. Clone & Install

```bash
git clone https://github.com/ashishlabs-23/Excerpt.git
cd Excerpt
npm install
```

### 2. Environment Variables

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (backend only) |
| `GOOGLE_AI_API_KEY` | Google Gemini API key |
| `GROQ_API_KEY` | Groq API key for fast inference |
| `ELEVENLABS_API_KEY` | ElevenLabs for voiceover |
| `REDIS_URL` | Redis connection URL |
| `B2_KEY_ID` | Backblaze B2 key ID |
| `B2_APPLICATION_KEY` | Backblaze B2 application key |

### 3. Set Up Database

Run the complete schema setup against your Supabase project:

```bash
node scripts/setup_database.mjs
```

Or paste `supabase/setup_complete_schema.sql` directly into the Supabase SQL Editor.

### 4. Start Development

```bash
# Start all services (Redis + API + Web)
docker-compose up -d redis

# Start API
npm run dev --workspace=apps/api

# Start Web
npm run dev --workspace=apps/web
```

---

## 🌐 Deployment

### Frontend → Netlify

The `netlify.toml` at the repo root is pre-configured:

```toml
[build]
  base    = "apps/web"
  command = "npm install && npm run build"
  publish = ".next"
```

Connect this repo to Netlify and set the required `NEXT_PUBLIC_*` environment variables.

### Backend + Worker → Render

The `render.yaml` defines two services:
- `excerpt-api` — Express REST API
- `excerpt-worker` — BullMQ clip processing worker

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Redis → Upstash

Create a free Redis database at [upstash.com](https://upstash.com) and set `REDIS_URL`.

---

## 📊 Database Schema

30 tables covering the full platform:

| Category | Tables |
|---|---|
| Core | `jobs`, `clips` |
| Processing | `job_events`, `worker_heartbeats`, `production_failures` |
| AI Learning | `editorial_corrections`, `boundary_policy_cache`, `policy_versions` |
| Benchmarking | `clip_scorecards`, `ground_truth_clips`, `engine_shadow_results` |
| Voiceover | `voiceover_clips`, `voiceover_feedback` |
| Reward Model | `reward_features`, `arena_matches`, `model_versions` |

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit changes (`git commit -m 'feat: add amazing feature'`)
4. Push the branch (`git push origin feat/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

Private repository — all rights reserved © 2026 Ashish Labs.

---

<div align="center">

Built with ❤️ by **Ashish Labs**

</div>
