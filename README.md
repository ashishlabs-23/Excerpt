<div align="center">

<img src="https://img.shields.io/badge/Excerpt-AI%20Video%20Clipping-orange?style=for-the-badge&logo=youtube&logoColor=white" alt="Excerpt" />

# ✂️ Excerpt — AI Video Clipping Platform

**Transform long-form videos into viral, 9:16 vertical publishable clips — automatically.**

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%26%20Firestore-FFA611?style=flat-square&logo=firebase)](https://firebase.google.com)
[![Gemini](https://img.shields.io/badge/Gemini-3.6%20Flash-4285F4?style=flat-square&logo=google)](https://ai.google.dev)
[![Netlify](https://img.shields.io/badge/Netlify-Deployed-00C7B7?style=flat-square&logo=netlify)](https://netlify.com)

[🚀 Live Demo](#) · [📖 Architecture](#-architecture) · [🐛 Report Bug](https://github.com/ashishlabs-23/Excerpt/issues)

</div>

---

## 🎯 What is Excerpt?

Excerpt is a **full-stack autonomous AI video clipping platform** that ingests YouTube videos and automatically detects, cuts, reframes to 9:16 vertical, captions, and prepares viral clips for social platforms (TikTok, Instagram Reels, YouTube Shorts).

```
YouTube URL ──► AI Hook Detection ──► Face Tracking Reframe ──► Smart Crop ──► Captions ──► Cloud Storage
```

---

## ✨ Core Capabilities & Features

| Feature | Description |
|---|---|
| 🤖 **AI Hook Detection** | Neural multimodal pipeline detects viral hooks using **Gemini 3.6 Flash** & **Groq Qwen 3.6** |
| 🎯 **Smart 9:16 Reframe** | Continuous face-tracking & heuristic saliency centering with smooth EMA damping |
| 🎙️ **Voiceover Studio** | Dynamic narration & commentary generation via ElevenLabs / TTS |
| 📊 **Editor Arena** | Reviewer scoring & comparative ranking to fine-tune viral prediction weights |
| ⚡ **Resilient Cloud Queue** | Distributed worker orchestration with automatic failover and local JSON offline sync |
| 🔐 **Firebase Authentication** | Secure Google OAuth and Email/Password sign-in powered by Firebase Auth |
| 🗄️ **Cloud Firestore** | Document persistence for jobs, clips, and rendering states |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Netlify)                    │
│           Next.js 14 · TypeScript · Tailwind CSS        │
│              Firebase Client SDK (Auth & Data)          │
└────────────────────────┬────────────────────────────────┘
                         │ REST / JSON
┌────────────────────────▼────────────────────────────────┐
│                  BACKEND API (Node.js)                   │
│          Express · Firebase Admin SDK · Firestore       │
└──────────┬────────────────────────┬─────────────────────┘
           │                        │
    ┌──────▼──────┐        ┌────────▼────────┐
    │ State & Log │        │ Firebase / B2   │
    │  Firestore  │        │  Cloud Storage  │
    └──────┬──────┘        └─────────────────┘
           │
    ┌──────▼──────────────────────────────────────────────┐
    │                   WORKER PIPELINE                   │
    │  DownloadEngine ──► Whisper ──► Gemini 3.6 Flash    │
    │  ──► Cinematic Reframe ──► FFmpeg 9:16 ──► Storage  │
    └─────────────────────────────────────────────────────┘
```

### Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS, Firebase Client SDK
- **Backend API**: Node.js, Express, TypeScript, Firebase Admin SDK
- **AI & Perception**: Google Gemini 3.6 Flash, Groq (`qwen/qwen3.6-27b`, Whisper-large-v3)
- **Video Processing**: FFmpeg, Smart Crop Planner, Dynamic Face Tracker
- **Database & Auth**: Firebase Authentication & Cloud Firestore (Project `excerpt-d0ab8`)
- **Storage**: Firebase Storage / Backblaze B2 (S3-compatible)

---

## 📁 Project Structure

```
Excerpt/
├── apps/
│   ├── web/                 # Next.js frontend application
│   │   ├── src/
│   │   │   ├── app/         # App router pages (dashboard, editor, auth, arena)
│   │   │   ├── components/  # React UI components & player
│   │   │   └── lib/         # Firebase client config & API client
│   └── api/                 # Express API + Video/Render Workers
│       ├── src/
│       │   ├── middleware/  # Firebase Auth & Security guards
│       │   ├── routes/      # Video, clip, and system endpoints
│       │   ├── services/    # AI, Firebase, VideoProcessor, Storage
│       │   └── workers/     # VideoWorker & RenderWorker pipelines
├── packages/
│   ├── clipping-core/       # Core pipeline contracts, artifact validators & scoring
│   └── ui/                  # Shared UI components
├── temp/                    # Resilient local cache & storage mirror
└── render.yaml              # Backend deployment specification
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- FFmpeg installed and available on PATH
- Google AI Studio API Key (`gemini-3.6-flash`)
- Groq API Key
- Firebase Project Service Account credentials (`excerpt-d0ab8`)

### 1. Clone & Install

```bash
git clone https://github.com/ashishlabs-23/Excerpt.git
cd Excerpt
npm install
```

### 2. Environment Configuration

Create `.env` at root:

```ini
# Google AI Studio & Groq
GOOGLE_AI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key

# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=excerpt-d0ab8.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=excerpt-d0ab8
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=excerpt-d0ab8.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Storage (Optional / Backblaze B2)
B2_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_app_key
B2_BUCKET_NAME=excerpt-clips
B2_REGION=us-east-005
```

Place `firebase-service-account.json` into `apps/api/` for backend Admin SDK verification.

### 3. Run Development Servers

```bash
# Start Web Frontend
npm run dev --workspace=apps/web

# Start API Server
npm run dev --workspace=apps/api

# Start Video Worker (processes clip jobs)
npx tsx apps/api/src/workers/videoWorker.ts

# Start Render Worker (renders 9:16 vertical cuts)
npx tsx apps/api/src/workers/renderWorker.ts
```

---

## 🌐 Deployment

### Frontend → Netlify / Vercel

```bash
npm run build --workspace=apps/web
```

Set `NEXT_PUBLIC_FIREBASE_*` environment variables in your deployment dashboard.

### Backend API & Workers → Render

The repository includes `render.yaml` configuring:
- `excerpt-api` (Web Service)
- `excerpt-video-worker` (Background Worker)
- `excerpt-render-worker` (Background Worker)

---

## 📄 License

Private repository — all rights reserved © 2026 Ashish Labs.

<div align="center">

Built with ❤️ by **Ashish Labs**

</div>
