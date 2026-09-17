---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt System Overview

Excerpt is an automated short-form video generation engine that extracts high-retention, publication-ready vertical clips (9:16) from arbitrary long-form horizontal (16:9) video sources.

---

## 1. Architectural Philosophy

The platform is structured around two distinct operational realms:

```text
┌─────────────────────────────────────────────────────────────┐
│                    PROBABILISTIC DOMAIN                     │
│  User Intent → LLM Ranking → Viral Hook Models → Personas   │
└──────────────────────────────┬──────────────────────────────┘
                               │ Structured Config
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    DETERMINISTIC DOMAIN                     │
│  Coordinate Math → Feasible Crop Solver → ASS Subtitles      │
│  FFmpeg Process Trees → Checksums → Storage Immutability     │
└─────────────────────────────────────────────────────────────┘
```

1. **Pure Core Isolation**: Pure mathematical transformations (framing geometry, subtitle alignment, Bradley-Terry ranking, RenderPlan creation) reside in `packages/clipping-core`. This package contains zero I/O, zero network, and zero database dependencies.
2. **Single-Owner Worker Boundaries**: Asynchronous workers (`videoWorker`, `renderWorker`) own the execution lifecycle of parent jobs and child render tasks respectively.
3. **Fail-Closed Safety**: Any breach of Class 1 geometric boundaries (head cutoff, subtitle overlap) or storage corruption halts processing before delivery.

---

## 2. High-Level Subsystem Layout

```text
Excerpt/
├── apps/
│   ├── api/                   # Express/TypeScript REST API + Background Workers
│   └── web/                   # Next.js 14 Web Application & Clip Review Studio
├── packages/
│   └── clipping-core/         # Pure deterministic clipping & framing engine
├── supabase/
│   └── migrations/            # Canonical PostgreSQL schema & RLS policies
├── benchmarks/                # Test corpora, runners, and measured reports
├── datasets/                  # Gold sets, fixtures, and JSON schemas
└── docs/                      # Authoritative documentation taxonomy
```

---

## 3. Core Engine Guarantees

- **Audio/Video Sync**: Subtitle and video stream alignment guaranteed within $\pm 40\text{ ms}$ (1 frame at 25 fps).
- **Geometric Invariants**: Feasible crop solving guarantees $\ge 5\%$ headroom padding and lower $22\%$ subtitle clearance.
- **Idempotency**: Content-addressed SHA256 storage prevents duplicate transcoding and duplicate uploads.
