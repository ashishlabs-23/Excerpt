---
status: archived
owner: clipping-core
last_reviewed: 2026-09-17
---

# Excerpt Framing & Trajectory Planning Research

This document synthesizes industry research, academic papers, and internal empirical evaluations regarding automated video reframing from landscape (16:9) to portrait (9:16).

---

## 1. Literature & Industry Approaches

### Google AutoFlip
Google's AutoFlip pipeline established the foundational framing paradigm:
1. **Scene Cut Detection**: Segment video into continuous shots.
2. **Saliency & Face Detection**: Track bounding boxes of faces, bodies, and salient objects.
3. **Camera Trajectory Optimization**: Solve a 1D optimization problem to fit a virtual camera window while minimizing jerk and acceleration.

### Limitations in Pure AutoFlip
While mathematically elegant, standard AutoFlip often suffers from:
- **Subtitle Collision**: Failure to account for lower-third caption burn-in zones.
- **Micro-Jitter**: Continuously panning to track slight head movements, creating viewer motion sickness.

---

## 2. Excerpt Architectural Innovations

To overcome these limitations, Excerpt's `SmartReframeEngine` implements:

1. **Feasible Crop Region $[y_{\min}, y_{\max}]$**:
   - Closed-form vertical interval solver guaranteeing $\ge 5\%$ headroom padding above the face and keeping the chin/mouth above the lower $22\%$ subtitle occlusion zone.
2. **Normalized Invariant Pipeline**:
   - Perception coordinates $[0, 1]$ are strictly projected into source-pixel coordinates $[0, W] \times [0, H]$ before any geometric logic executes, eliminating mixed-coordinate corruption bugs.
3. **4-State Camera Arbitration Machine (`HOLD`, `TRACK`, `PAN`, `CUT`)**:
   - **`HOLD`**: Camera remains fixed when subject motion is within a $3\%$ deadband.
   - **`TRACK`**: Smooth velocity-capped camera motion following legitimate subject displacement.
   - **`PAN`**: Transition between distinct speakers across shot boundaries.
   - **`CUT`**: Instantaneous jump cut on hard scene transitions or significant camera pans ($> 25\%$ frame width).
4. **Speaker Turn Hysteresis**:
   - Requires a minimum dwell duration ($1.8\text{ s}$) before switching virtual camera focus to a new speaker, preventing rapid back-and-forth whiplash in debate and conversation formats.

---

## 3. Empirical Verification Summary

Evaluated across 1,540 video frames across 7 diverse genres (podcast, interview, tutorial, gaming, sports, debate, and 1080p real footage):
- **Class 1 Hard Defects**: **0** head cutoffs, **0** chin cutoffs, **0** subtitle collisions, **0** unsafe crops.
- **Physical Camera Velocity**: P50: $95.7\text{ px/s}$, P95: $237.6\text{ px/s}$ (bounded under the $450\text{ px/s}$ target).
