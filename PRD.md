# PRD: Excerpt — AI Video Clipping Platform

> **Status**: Active (Hardening Phase)  
> **Canonical Reference**: [`docs/architecture/PRODUCT_TARGET_AND_INTENT.md`](docs/architecture/PRODUCT_TARGET_AND_INTENT.md)

---

## 1. Executive Purpose
Excerpt transforms long-form video content (podcasts, interviews, streams) into viral, high-engagement 9:16 vertical short-form clips (TikTok, YouTube Shorts, Instagram Reels) autonomously.

## 2. Core User Stories & Capabilities
- **US-1 Ingest & Transcribe**: User submits a YouTube URL or uploads video file $\rightarrow$ system produces word-aligned transcript and audio analysis.
- **US-2 Viral Candidate Identification**: Multi-modal perception evaluates hook potential, humor, tension, or insight $\rightarrow$ scores and ranks moments.
- **US-3 Intelligent 9:16 Reframing**: TalkNet active speaker detection tracks talking faces and dynamic visual interest $\rightarrow$ generates fluid vertical crop plans.
- **US-4 Automated Polish**: Word-level kinetic captions + EBU R128 audio normalization (anti-pop fades, rumble filter).
- **US-5 Export & Cloud Delivery**: High-definition (1080p CRF 17) rendering $\rightarrow$ Backblaze B2 delivery with HTTP 206 preview streaming.

## 3. Non-Goals
- Real-time live-streaming reframing (batch/queue processing only).
- Manual timeline NLE video editing software (Excerpt is autonomous-first).
