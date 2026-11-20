# Design Document: Excerpt UI/UX System

> **Status**: Production System Specifications  
> **App Implementation**: `apps/web` (Next.js 14 + Tailwind CSS)

---

## 1. Visual & Layout Architecture
- **Orientation & Ratio Focus**: Central focus on **9:16 vertical preview** with dynamic safe-zone overlays (TikTok/Reels UI bounds).
- **Theme**: Dark mode first (`#09090b` zinc neutral palette) optimized for video creators.
- **Component Primitives**: Tailwind CSS with Radix UI / shadcn style accessible primitives.

## 2. Core Screen Specifications
1. **Upload / Ingestion View** (`apps/web/src/components/UploadZone.tsx`):
   - Dual-input: YouTube URL parse or drag-and-drop video file with progress feedback.
2. **Editor & Clip Review Studio** (`apps/web/src/app/editor/page.tsx`):
   - **Left Panel**: Candidate clip selector and viral score cards (`EditorSidebar.tsx`).
   - **Center Panel**: Real-time 9:16 HTML5 video player with HTTP 206 byte-range seeking (`VideoPlayer.tsx`).
   - **Right Panel**: Kinetic subtitle transcript viewer and timing editor (`TranscriptView.tsx`).
   - **Bottom Panel**: Interactive timeline scrubber and audio waveform visualizer (`Timeline.tsx`).

## 3. UI Invariants
- Video player must never freeze during byte-range scrub; avoid 302 redirects in HTML5 video sources.
- Fluid responsive layout without horizontal scrolling on desktop display.
