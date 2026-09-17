---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Acceptance Gates

This document defines the strict pass/fail gates that all production pull requests and pipeline builds must satisfy.

---

## 1. Class 1: Hard Geometric & Safety Gates (0 Defect Tolerance)

Any failure in Class 1 immediately fails the build or marks the clip generation as unviable.

| Gate ID | Area | Invariant | Threshold | Verification Tool |
| :--- | :--- | :--- | :--- | :--- |
| **GATE-01** | Framing | Head cutoff | **0 frames** | `SmartReframeEngine` / P6 Benchmark |
| **GATE-02** | Framing | Chin cutoff | **0 frames** | `SmartReframeEngine` / P6 Benchmark |
| **GATE-03** | Framing | Lower subtitle zone violation | **0 frames** | Subtitle clearance $\ge 22\%$ |
| **GATE-04** | Framing | Viewport out-of-bounds | **0 frames** | Clamped to $[0, 0, W, H]$ |
| **GATE-05** | Framing | Wrong-subject speaker lock | **0 frames** | Normalized speaker coordinate space |
| **GATE-06** | Retention | Fresh unexpired object purge | **0 files** | `RetentionService` age cutoff |
| **GATE-07** | Pipeline | RenderPlan job count mismatch | **0 jobs** | `jobs.length === candidates.length` |

---

## 2. Class 2: Trajectory & Experience Quality Gates (Continuous Telemetry)

Class 2 metrics track subjective production quality, smoothness, and user perception.

| Gate ID | Metric | Target Threshold | Degradation Warning |
| :--- | :--- | :--- | :--- |
| **QG-01** | Max Camera Velocity | $\le 450\text{ px/s}$ | $> 500\text{ px/s}$ |
| **QG-02** | Rapid Speaker Switching | 0 switches $< 1.8\text{ s}$ dwell | Any switch $< 1.5\text{ s}$ |
| **QG-03** | P95 Normalized Crop Delta | $\le 0.060$ | $> 0.080$ |
| **QG-04** | Subtitle Desync P95 | $\le 40\text{ ms}$ | $> 60\text{ ms}$ |
| **QG-05** | Audio Peak Clipping | $0\text{ dBFS}$ with -1.0 dBFS true peak | True peak $> -0.5\text{ dBFS}$ |

---

## 3. Subsystem Hardening Sign-Offs (Frozen)

- **Caption Synchronization**: Verified $\le 40\text{ ms}$ word-start timing error, $0\text{ ms}$ cumulative drift over 45-minute audio, zero subtitle ghosting over $> 300\text{ ms}$ silences. Raw evidence in [`benchmarks/reports/caption_sync/`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/caption_sync/).
- **Long-Form Video Duration**: Container vs stream duration variance $\le 80\text{ ms}$ (P95: $12\text{ ms}$), zero audio/video packet loss on transcode. Raw evidence in [`benchmarks/reports/long_form/`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/long_form/).
- **Retention Engine**: 20/20 automated tests passing; live empty-bucket and expired-object purge verified against Backblaze B2. Operational contract in [`docs/operations/RETENTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RETENTION.md).

---

## 4. Promotion Policy

- **To Staging**: Must satisfy all Unit Tests + Level 1 & 2 Gates.
- **To Production**: Must pass Level 1 + Level 2 + 100% of Class 1 Safety Gates across benchmark corpora.
