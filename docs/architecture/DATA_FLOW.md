---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# Excerpt Data Flow

This document details the transformation of data entities across the Excerpt pipeline lifecycle.

---

## 1. Entity Transformation Sequence

```text
Raw Video URL / File
       │
       ▼ [Ingestion]
MediaArtifact
  ├── durationMs: number
  ├── dimensions: { width: number, height: number }
  ├── checksumSha256: string
  └── codecs: { video: string, audio: string }
       │
       ▼ [Perception & Transcription]
PerceptionFrame[] & TranscriptWord[]
  ├── timestampMs: number
  ├── faces: [{ x, y, w, h, confidence, speakerId }]  (Normalized [0, 1])
  └── activeSpeakerId: string
       │
       ▼ [Candidate Generation & Ranking]
AcceptedCandidate[]
  ├── startTimeMs: number
  ├── endTimeMs: number
  ├── score: number
  └── editorialHook: string
       │
       ▼ [Director & Reframe Engine]
ReframePlan
  └── keyframes: CameraKeyframe[]
        ├── timestampMs: number
        ├── cropBox: { x: number, y: number, width: number, height: number } (Source Pixels)
        └── cameraMode: 'HOLD' | 'TRACK' | 'PAN' | 'CUT'
       │
       ▼ [Render Planning]
RenderPlan
  ├── jobs: RenderJob[]
  └── subtitleScript: ASSContent
       │
       ▼ [Compositing & Delivery]
RenderedClip
  ├── b2StoragePath: string
  ├── durationMs: number
  └── playbackUrl: string (Signed URL)
```

---

## 2. Coordinate Space Transformation Invariant

A strict invariant governs coordinate spaces:

1. **Perception**: Coordinates are normalized floating point values $[0.0, 1.0]$ relative to source width and height.
2. **Director**: Normalized coordinates are strictly multiplied by source dimensions $(W, H)$ to yield physical source-pixel bounding boxes before computing crop boxes.
3. **Render**: Physical crop coordinates are passed to FFmpeg `crop=w:h:x:y` filters.
