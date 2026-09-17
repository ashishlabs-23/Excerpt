---
status: current
owner: product-architecture
last_reviewed: 2026-09-17
version: 2.0
---

# Excerpt — Strategic Product & Architecture Gap Analysis (v2)

**Research Refresh**: September 2026  
**Purpose**: Convert Excerpt from a technically strong clipping/transcoding pipeline into an end-to-end creator workflow without destabilizing the deterministic core.

---

## 1. Executive Position

### Current Engineering Reality
Excerpt has already invested heavily in the difficult infrastructure layer:
- Fault-tolerant ingestion and rendering
- Deterministic crop geometry
- Caption safety and synchronization
- Durable retention/retry behavior
- Process-tree cleanup
- Content-addressed source artifacts
- Perception caching
- RenderPlan validation
- Delivery and playback validation

The audit correctly identifies the resulting product gap: **the system can produce a valid short-form MP4, but the product does not yet provide the complete creator outcome** from long-form media → compelling edit → review → packaging → publication → learning.

### Revised Target
Do **not** define the product as:
> *"An autonomous AI that guarantees viral clips."*

Define it as:
> **An AI-assisted content repurposing system that discovers high-potential moments, composes platform-native clips, explains its edits, lets creators make fast non-destructive corrections, packages the post, and learns from publishing outcomes.**

This is a substantially stronger, more defensible, and empirically grounded product target.

---

## 2. Research Corrections to the Initial Gap Analysis

Several ideas in early discussions were directionally useful but should not remain as hard factual claims without empirical evidence:

### 2.1 "80% of top podcast clips use stacked split-screen"
- **Status**: Not independently verified.
- **Correction**: The repository audit observes that `split_screen_stack` exists in `SmartReframeEngine.ts` but is not implemented in the renderer. That is a real product/code gap. The "80%" prevalence figure should be treated as an internal hypothesis until measured against a defined corpus.
- **Replacement Principle**: Multi-speaker conversational content is an important format in the target market, and Excerpt currently has a renderer capability gap for layouts requiring more than one simultaneous subject. This creates a testable benchmark instead of an unsupported market statistic.

### 2.2 "The first 2.5 seconds determine 90% of reach"
- **Status**: Not verified and too deterministic.
- **Correction**: There is no sound basis for encoding a universal "90% of reach" rule into the system.
- **Replacement Principle**: Treat the opening 0–3 seconds as a configurable hook window and measure whether hook variants improve measurable early-viewer outcomes in Excerpt's own experiments. YouTube currently distinguishes views from engaged views for Shorts, reinforcing the need to use measurable outcome definitions rather than a single universal "viral" score.

### 2.3 "Subtitles should be client-side WebGL"
- **Status**: Implementation detail, not a product requirement.
- **Correction**: CapCut documents editing subtitle text, timing, and style directly in its timeline. Adobe's Text-Based Editing similarly keeps transcript/timeline edits synchronized with the video. The important product principle is non-destructive editing, not whether the preview is implemented with WebGL, Canvas, DOM, or another renderer.
- **Replacement Principle**: Edit transcript/caption/layout state immediately in the browser; server rendering happens only when an exportable media artifact is requested.

### 2.4 "YouTube ingestion should never fail"
- **Status**: Impossible to guarantee and misleading.
- **Correction**: The correct goal is: maximize authorized, observable, recoverable ingestion success while respecting platform terms and separating acquisition failures from downstream intelligence failures. Keep the existing acquisition adapter for supported URL ingestion, but do not turn anti-bot circumvention into a core product dependency.

---

## 3. The Missing Product Layer

The largest architectural opportunity is **not another AI model**. It is a **creator-edit model between intelligence and final rendering**.

### Current Conceptual Flow:
```text
Long Video ──► Perception ──► Candidate ──► Crop + Captions ──► FFmpeg ──► MP4
```

### Target Conceptual Flow:
```text
Long Video
    │
    ▼
Perception / Understanding
    │
    ▼
Candidate Graph
    │
    ▼
Editorial Decision
    ├── moment
    ├── boundary
    ├── hook
    ├── composition
    ├── framing
    ├── captions
    ├── visual emphasis
    └── audio treatment
    │
    ▼
┌──────────────────────────────────────────────┐
│           Editable ClipProject               │
│        (Core Product Abstraction)            │
└──────────────────────┬───────────────────────┘
                       │
                       ▼
                 Creator Review
                       │
                       ▼
                   RenderPlan
                       │
                       ▼
                     Render
                       │
                       ▼
              Delivery Validation
                       │
                       ▼
               Platform Packaging
                       │
                       ▼
                   ClipBundle
          (MP4 + Poster + SRT + VTT)
                       │
                       ▼
             Performance Feedback &
               Outcome Learning
```

This allows Excerpt to remain deterministic at its core while becoming vastly more capable at the product level.

---

## 4. Priority Gap #1 — Multi-Subject Composition

### Problem
The audit found that `SmartReframeEngine.ts` can calculate `split_screen_stack`, while the renderer currently executes a single crop path (`crop=w:h:x:y`). The decision layer can express a layout that the rendering layer cannot realize. This is an architectural contract mismatch.

### Solution: General Composition System
Do not implement only `split_screen_stack`. Create a structured composition vocabulary inside the clipping/render contract:
- `single_subject`
- `split_stack`
- `split_side_by_side`
- `screen_plus_face`
- `gameplay_plus_face`
- `full_frame_broll`

Only implement the modes demonstrated by benchmark demand (starting with `split_stack`).

### CompositionPlan Schema
```typescript
export type CompositionMode =
  | 'single_subject'
  | 'split_stack'
  | 'split_side_by_side'
  | 'screen_plus_face'
  | 'gameplay_plus_face'
  | 'full_frame_broll';

export interface CompositionPlan {
  mode: CompositionMode;
  canvas: {
    width: number;
    height: number;
    aspectRatio: string;
  };
  tracks: Array<{
    sourceId: string;
    region: { x: number; y: number; width: number; height: number }; // Normalized [0, 1]
    crop?: { x: number; y: number; width: number; height: number };   // Pixel crop
    targetBounds: { x: number; y: number; width: number; height: number }; // Canvas placement
    zIndex: number;
  }>;
  safeZones: Array<{
    top: number;
    bottom: number;
    left: number;
    right: number;
  }>;
}
```

> **Design Invariant**: The director decides the composition; the renderer realizes the composition. Composition logic must never leak into FFmpeg CLI generation code.

### Benchmark Corpus
Create 10–20 multi-speaker scenarios covering:
- Two-person podcast
- Three-person podcast
- Interview
- Debate
- Reaction / interruption
- One active speaker + visible listener reaction

**Metrics to measure**: `wrong_subject_rate`, `speaker_visibility`, `face_loss_rate`, `subtitle_collision_rate`, `layout_switches_per_minute`, `crop_jitter`, `editor_preference`.

---

## 5. Priority Gap #2 — Hook Architecture

A hook must be treated as an **edit plan**, not merely a text banner.

### HookPlan Schema
```typescript
export interface HookPlan {
  sourceWindow: {
    start: number;
    end: number;
  };
  headline?: string;
  punchIn?: {
    enabled: boolean;
    fromScale: number;
    toScale: number;
    durationMs: number;
  };
  emphasis?: {
    words: string[];
    visualTreatment: string;
  };
  openingMode:
    | 'cold_open'
    | 'context_first'
    | 'question'
    | 'claim'
    | 'reaction';
}
```

Generate multiple hook candidates when useful:
- **Variant A**: Strongest statement
- **Variant B**: Curiosity / question
- **Variant C**: Reaction / payoff-first

Optimize for measurable properties rather than claiming a hook will "go viral":
- Semantic completeness
- Opening information density
- Novelty
- Payoff proximity
- Speaker clarity
- Visual salience
- Caption readability
- Early-retention outcome

---

## 6. Priority Gap #3 — Non-Destructive Editing

### Current Problem
```text
caption typo ──► new render job ──► full encode (30-60s)
```

### Target Architecture
```text
caption typo ──► update project state ──► instant browser preview (<100ms) ──► export when ready ──► render once
```

### Canonical `ClipProject`
```typescript
export interface ClipProject {
  id: string;
  sourceArtifact: {
    sourceId: string;
    videoPath: string;
    duration: number;
    dimensions: { width: number; height: number };
  };
  clipRange: {
    startTime: number;
    endTime: number;
    inPoint: number;
    outPoint: number;
  };
  composition: CompositionPlan;
  cameraPath: Array<{
    timeSec: number;
    cropBox: { x: number; y: number; width: number; height: number };
    mode: string;
  }>;
  captions: {
    words: Array<{
      id: string;
      word: string;
      start: number;
      end: number;
      confidence: number;
      isExcluded?: boolean;
    }>;
    stylePreset: string;
    colors?: { primary: string; highlight: string; outline: string };
    position: 'bottom' | 'middle' | 'top';
  };
  overlays: Array<{
    id: string;
    type: 'headline' | 'broll' | 'sticker';
    startTime: number;
    endTime: number;
    content: string;
  }>;
  hook: HookPlan;
  audio: {
    loudnessNormalized: boolean;
    antiPopFadeMs: number;
  };
  brand?: BrandProfile;
  platformProfile: PlatformProfile;
  version: number;
}
```

### Three Clean Subsystem States:
1. **SOURCE**: Immutable media.
2. **PROJECT**: Editable edit decision state (`ClipProject`).
3. **ARTIFACT**: Rendered / exported media.

---

## 7. Priority Gap #4 — Publication Bundle

"Publication-ready" must become a concrete artifact contract rather than an isolated `.mp4` link:

```text
ClipBundle/
├── clip.mp4              # High-fidelity vertical video
├── preview.mp4           # Lightweight fast-scrub preview
├── poster.jpg            # Emotion-selected cover frame
├── captions.srt          # Universal SubRip subtitle file
├── captions.vtt          # WebVTT subtitle file
├── edit-project.json     # Serializable ClipProject state
└── metadata.json         # Platform packaging & metadata
```

### `metadata.json` Schema:
```json
{
  "titleCandidates": [
    "The Real Reason Startups Fail",
    "Why 90% of Founders Make This Mistake",
    "How to Survive Your First Startup Year"
  ],
  "description": "The brutal truth about early-stage startup survival from today's conversation.",
  "hashtags": ["#startup", "#tech", "#entrepreneur", "#business", "#podcast"],
  "source": {
    "videoId": "src_14ea2cbd",
    "start": 142.5,
    "end": 189.2
  },
  "contentWarnings": [],
  "language": "en"
}
```

---

## 8. Explicit Operational Scoping: Publishing & Ingestion Policy

Per project governance guidelines:
- **NO Automated Social Network Uploads**: Excerpt does **not** perform autonomous background publishing to YouTube, TikTok, or Instagram. All publications remain creator-initiated via the generated `ClipBundle`.
- **NO Autonomous Channel Scraping / Push Event Daemons**: Jobs are initiated strictly through direct user input (URL or file upload). No background channel monitoring bots are deployed.
- **Platform Adapters as Contracts**: The platform publishing layer is specified as a standard `PublishPlan` contract in `clipping-core`, decoupling deterministic rendering from platform SDKs.

---

## 9. Outcome Learning Architecture

Excerpt connects generated edits to actual measured outcomes via a structured telemetry loop:

```text
Clip Decision ──► Published Artifact ──► Platform Performance ──► Outcome Record ──► Feature Attribution ──► Ranking Update ──► Shadow Evaluation ──► Promotion
```

### Feature Record:
`clip_id`, `source_id`, `genre`, `duration`, `hook_type`, `hook_strength`, `composition_mode`, `caption_style`, `speaker_count`, `scene_change_rate`, `audio_energy`, `visual_saliency`, `boundary_type`, `views`, `engaged_views`, `watch_time`, `average_view_duration`, `likes`, `shares`.

Outcomes are normalized to control for channel size, upload date, topic, clip length, and audience.

---

## 10. Brand Memory (`BrandProfile`)

To transition Excerpt from an ephemeral AI clip tool into an indispensable creator operating system, introduce a typed `BrandProfile`:

```typescript
export interface BrandProfile {
  id: string;
  name: string;
  fonts: {
    headline: string;
    caption: string;
  };
  captionStyle: 'hormozi' | 'mrbeast' | 'submagic' | 'minimalist' | 'neon';
  colors: {
    primary: string;
    highlight: string;
    background: string;
  };
  logoUrl?: string;
  preferredAspectRatio: '9:16' | '1:1' | '16:9';
  defaultHookStyle: 'banner' | 'pill' | 'highlight';
  bannedWords: string[];
  preferredLanguage: string;
  ctaPolicy?: {
    enabled: boolean;
    text: string;
    durationSec: number;
  };
}
```

---

## 11. Dual Quality Standards: Beyond "No Defects"

Eliminating crashes and bad crops is necessary but insufficient. We establish two distinct quality classes:

### Class 1 — Safety & Correctness (Hard Gate: PASS / FAIL)
- Face loss
- Wrong subject tracking
- Subtitle collision
- Mid-word boundary clipping
- Invalid media container
- Missing caption synchronization
- Broken artifact or unplayable output

### Class 2 — Editorial Quality (Diagnostic Gate: SCORE / RANK)
- Crop smoothness (jitter $\le 5\text{ px}$)
- Camera mode stability
- Hook information density & payoff proximity
- Visual rhythm
- Semantic completeness
- Reaction preservation in multi-speaker dialogue
- Caption emphasis accuracy
- Composition appropriateness

A result can therefore be:
```text
PASS (Safe)  BUT  NEEDS IMPROVEMENT (Editorial Quality)
```

---

## 12. Phased Implementation Roadmap

```text
PHASE A: Contract Alignment (Immediate)
├── [clipping-core] Define CompositionPlan & Layer specifications
├── [clipping-core] Define HookPlan contract & variants
├── [clipping-core] Define ClipProject schema & serialization
├── [clipping-core] Define ClipBundle & PlatformProfile contracts
└── Zero new AI models, zero speculative agent frameworks

PHASE B: Multi-Subject Composition
├── [clipping-core] SmartReframeEngine multi-speaker split_stack calculation
├── [apps/api] renderWorker FFmpeg compositing for split_stack
└── Real-video multi-speaker benchmark validation

PHASE C: Hook System
├── [clipping-core] Hook candidate generation & opening mode classification
├── [apps/api] Opening punch-in zoom & headline overlay synthesis
└── Benchmark hook evaluation across semantic density and payoff proximity

PHASE D: Fast Creator Review Studio
├── [apps/web] Non-destructive transcript & caption text editing
├── [apps/web] In-browser instant preview updating ClipProject state
└── Export-on-demand trigger compiling ClipProject to RenderPlan

PHASE E: Publication Bundle Delivery
├── [apps/api] ClipBundle generator (clip.mp4, poster.jpg, captions.srt, captions.vtt, metadata.json)
└── [apps/web] Studio download package delivery

PHASE F: Brand Memory & Outcome Feedback
├── [apps/api] BrandProfile persistence
└── [clipping-core] Closed-loop feature attribution & ranking refinement
```

---

## 13. What NOT to Build Yet (Strict Ponytail Boundaries)

Do **not** respond to this analysis by adding speculative models. Until benchmarks prove a concrete defect, avoid:
- ❌ Another tracking model
- ❌ Another face detector
- ❌ Another "virality" score heuristic
- ❌ Generic LLM autonomous agents
- ❌ RLHF or retraining reward model pipelines
- ❌ Heavy generative B-roll synthesis
- ❌ Microservice splits or additional shared packages
- ❌ Automated background publishing bots

The highest-value work is making existing intelligence **expressible, renderable, editable, measurable, and cleanly packaged**.

---

## 14. Target Architecture Overview

```text
                         EXCERPT
                            │
                 ┌──────────▼──────────┐
                 │     Acquisition     │
                 │  direct upload/URL  │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Perception +        │
                 │ Understanding       │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Candidate Graph     │
                 │ + Ranking           │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │  Editorial Planner  │
                 │  hook/boundary/etc. │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │     ClipProject     │
                 │  editable decision  │
                 │        state        │
                 └──────────┬──────────┘
                            │
                   ┌────────▼────────┐
                   │ Creator Review  │
                   └────────┬────────┘
                            │
                 ┌──────────▼──────────┐
                 │     RenderPlan      │
                 │ composition/caption │
                 │    audio/effects    │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Render + Validation │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Publication Bundle  │
                 │ (MP4/Poster/SRT/JSON│
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Performance         │
                 │ Feedback & Outcome  │
                 └──────────┬──────────┘
                            │
                 ┌──────────▼──────────┐
                 │ Learning / Ranking  │
                 └─────────────────────┘
```

---

## 15. Immediate Next Steps

1. **Define `CompositionPlan` in `@excerpt/clipping-core`** (`single_subject`, `split_stack`, `split_side_by_side`).
2. **Update `RenderPlan` in `@excerpt/clipping-core`** to support composition layers.
3. **Implement `split_stack` in `renderWorker.ts`** using an FFmpeg filtergraph for dual-speaker layouts.
4. **Define `ClipProject` in `@excerpt/clipping-core`** as the canonical non-destructive edit state.
5. **Decouple captions from render output to editable project state** in the web studio.
6. **Define `HookPlan` & `ClipBundle` contracts**.
