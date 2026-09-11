# P3 Unified Perception Snapshot & Cache Scorecard

## Overview
- **Source Video**: `input.mp4` (234.91 MB, 30s)
- **Architecture**: Unified Perception Build (Single-pass orchestration of distinct FFmpeg/Whisper/Tracking passes)
- **Cache Strategy**: L1 Disk + In-Memory + Supabase Metadata Index
- **Range Query Complexity**:
  - Audio: $O(k)$ array index offset ($k = \text{duration} / 0.5\text{s}$)
  - Sparse Events (Scenes, Speakers, Transcript): $O(\log n + m)$ via binary search

---

## Measured Performance Metrics

| Metric | Baseline (Un-unified) | P3 Unified (Cold) | P3 Unified (Warm) | Improvement / Verdict |
| :--- | :--- | :--- | :--- | :--- |
| **Analysis Subprocesses (5 clips)** | 21 child processes | 5 child processes | **0 child processes** | **100% downstream subprocess elimination** |
| **Duplicate CPU Work** | High (5× repeated analysis) | 1 canonical extraction | **0 duplicate CPU cycles** | **76.2% cold / 100% warm reduction** |
| **Candidate Query Latency** | 4,200 - 8,500 ms (FFmpeg/Python) | < 1 ms | **0.194 ms** | **>4,000× speedup per clip** |
| **Snapshot Disk Footprint** | N/A (unstructured) | 26.75 KB | 26.75 KB | **Compact event-driven schema** |
| **Cache Hit Latency** | N/A | N/A | **1 ms** | **Instantaneous warm retrieval** |

---

## Range Query Latency Breakdown (5 Candidates)
- **Candidate #1**: `0.653 ms`
- **Candidate #2**: `0.159 ms`
- **Candidate #3**: `0.094 ms`
- **Candidate #4**: `0.042 ms`
- **Candidate #5**: `0.023 ms`
- **Mean Latency**: `0.194 ms` (< 1.0 ms gate passed ✅)

---

## Architectural Hardening & Safety
1. **Schema Versioning**: `schemaVersion: '2.0'` + SHA-256 composite cache key (`sourceHash + manifest`).
2. **Storage Guard**: Supabase Postgres only stores lightweight index metadata; dense time-series and event structures remain in L1 disk/artifact storage.
3. **Identity Tracking**: Spatial identity preserved via `SpeakerTrack[]` with `centerX`, `centerY`, and `speakingProbability`.
4. **Zero Fallback Regression**: When snapshot is absent or stale, pipeline gracefully falls back to individual engine passes.
