# P2 Measured Encoder Benchmark Scorecard

**Generated:** 2026-09-09T16:14:40.014Z  
**Host Architecture:** 13th Gen Intel(R) Core(TM) i7-13620H (16 cores), NVIDIA GPU, 15.7 GB RAM  
**Filtergraph Surface:** 9:16 Dynamic Speaker Crop + Styled ASS Subtitles + B-Roll Overlay (PIP + Alpha Fade) + Hook Card + Progress Bar + Loudness Normalization (8.0s clip)

---

## 1. 4-Way Render Performance Matrix

| Configuration | Wall Clock (ms) | Speed (fps) | Realtime Mult | Size (KB) | Video Bitrate | Pix Fmt | HTTP 206 | Status |
|---|---|---|---|---|---|---|---|---|
| **libx264 Draft** | 22146 | 10.8 fps | 0.36x | 6373.0 | 6314 kbps | `yuv420p` | PASS | ✅ PASS |
| **h264_qsv Draft** | 9161 | 26.2 fps | 0.87x | 4254.6 | 4146 kbps | `yuv420p` | PASS | ✅ PASS |
| **libx264 Quality** | 42032 | 5.7 fps | 0.19x | 10414.4 | 10334 kbps | `yuv420p` | PASS | ✅ PASS |
| **h264_qsv Quality** | 11541 | 20.8 fps | 0.69x | 14039.6 | 14041 kbps | `yuv420p` | PASS | ✅ PASS |

---

## 2. Speedup & Efficiency Analysis

- **Draft Mode Speedup (libx264 vs QSV):** **2.42x** (22146ms vs 9161ms)
- **Quality Mode Speedup (libx264 vs QSV):** **3.64x** (42032ms vs 11541ms)
- **Draft Bitrate Delta:** -2168 kbps
- **Quality Bitrate Delta:** 3707 kbps

---

## 3. Empirical Decision & Encoder Policy

> **Selected Default Encoder:** `h264_qsv`  
> **Rationale:** QSV demonstrates empirical advantage (2.42x Draft / 3.64x Quality speedup) with full filtergraph parity, zero regressions, and valid HTTP 206 playback. Promoted to default.

### Slot Allocation Policy
- **CPU Render Slots:** `4` slots (`4` threads per libx264 instance)
- **GPU Render Slots:** `2` slots
- **Hardware Acceleration Availability:** Intel QSV (`true`), NVIDIA NVENC (`true`), AMD AMF (`true`)
