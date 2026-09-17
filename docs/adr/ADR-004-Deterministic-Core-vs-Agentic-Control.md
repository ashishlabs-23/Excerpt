---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# ADR-004: Deterministic Execution vs Probabilistic Decisions

## Status
**ACCEPTED** (2026-09-05)

## Context
Excerpt leverages machine learning and large language models (LLMs) for content understanding, semantic hook detection, and editorial evaluation. However, video processing, coordinate mathematics, timecodes, subtitle synchronization, and FFmpeg filtergraph generation require strict mathematical determinism.

Permitting probabilistic models or agentic LLMs to directly invoke FFmpeg, set crop coordinates, manipulate millisecond boundaries, or determine valid/invalid states introduces hallucinations, non-reproducible bugs, and catastrophic rendering failures.

## Decision
Establish a strict architectural boundary separating probabilistic reasoning from deterministic media execution:

```text
User intent / strategy
        ↓
probabilistic layer (LLM / Ranking / Heuristic evaluation)
        ↓
typed configuration (DirectorConfig, CandidateWindow, etc.)
        ↓
deterministic clipping core (packages/clipping-core)
        ↓
validated output (MediaArtifact, RenderPlan, ASS, MP4)
```

**Non-Negotiable Invariants:**
1. **Agentic Boundary**: Probabilistic and agentic layers may only output structured, strongly-typed configuration parameters (e.g. topic preferences, duration bounds, aesthetic presets).
2. **Deterministic Ownership**: The pure deterministic engine (`packages/clipping-core`) exclusively owns:
   - FFmpeg process lifecycles and filtergraph construction.
   - Crop viewport geometry and coordinate conversions.
   - Word-level subtitle timestamps and ASS formatting.
   - Hard validation checks (Class 1 safety gates).

## Consequences
- **Positive**: 100% reproducible clipping given the same inputs and configuration; zero hallucinated video formats or illegal crop dimensions; clean unit-testability without mocking LLMs.
- **Negative**: Feature changes require modifying strongly typed config schemas and pure TypeScript logic rather than prompt engineering alone.
