---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# Excerpt Benchmarking Methodology

This document outlines the benchmark harnesses, corpus definitions, and measurement reporting mechanisms.

---

## 1. Benchmark Suites

1. **P6.4 Framing & Trajectory Benchmark** (`apps/api/scripts/benchmark_p6_framing.ts`):
   - Evaluates smart reframe across 7 representative real-world test clips (`corpus-01` to `corpus-07`) spanning podcasts, interviews, gaming, tutorials, sports, debates, and real 1080p footage.
   - Evaluates frame-by-frame camera trajectories at $25\text{ Hz}$ against Class 1 safety bounds and Class 2 motion dynamics.
2. **Editorial Tournament & Ranking Benchmark** (`benchmarks/reports/editorial/`):
   - Bradley-Terry simulation league comparing candidate selection models against human curated ground truth.
3. **P3 Concurrency & Soak Benchmark** (`benchmarks/reports/soak/`):
   - Multi-worker load test evaluating job claim latency, Redis queue contention, and FFmpeg memory boundaries under saturation.

---

## 2. Directory Layout & Artifact Separation

```text
benchmarks/
├── definitions/     # Test schemas, fixture manifests, and ground truth definitions
├── fixtures/        # Fixed test data, video metadata, and reference transcripts
├── runners/         # Benchmark orchestration runners and metrics collectors
└── reports/         # MEASURED RESULTS ONLY (No documentation, pure data/markdown outputs)
    ├── caption_sync/
    ├── editorial/
    ├── framing/
    ├── long_form/
    ├── p2/
    ├── p3/
    └── soak/
```

> **Separation Rule**:
> - Documentation explaining methodology, gates, and sign-offs belongs in `docs/testing/`.
> - Raw benchmark outputs, scorecards, and metrics belong in `benchmarks/reports/`.
