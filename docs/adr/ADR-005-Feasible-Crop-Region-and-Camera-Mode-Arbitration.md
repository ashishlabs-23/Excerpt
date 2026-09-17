---
status: current
owner: clipping-core
last_reviewed: 2026-09-17
---

# ADR-005: Feasible Crop Region and Camera Mode Arbitration

## Status
**ACCEPTED** (2026-09-16)

## Context
Reframing 16:9 landscape source video into 9:16 vertical portrait format frequently encounters contradictory constraints:
1. Maintaining headroom ($\ge 5\%$) so the speaker's forehead is not cut off.
2. Avoiding the lower $22\%$ subtitle occlusion zone so the speaker's chin/mouth does not collide with on-screen captions.
3. Preventing rapid camera jitter and whiplash when speakers gesture, bend down, or alternate turns.

## Decision
Implement a closed-form geometric constraint solver and a 4-state camera arbitration machine inside `SmartReframeEngine`:

1. **Feasible Crop Region $[y_{\min}, y_{\max}]$**:
   - For every keyframe, compute the bounding interval for the vertical crop origin $y$ such that:
     $$y \le \text{face.top} - \text{minHeadroom}$$
     $$y + \text{cropHeight} \cdot (1 - \text{subtitleReserve}) \ge \text{face.bottom}$$
   - When the subject height exceeds the allowable safe window, the engine clamps to the midpoint with warning telemetry rather than breaching subtitles.
2. **Normalized Invariant**:
   - Normalized face perception coordinates $[0, 1]$ are strictly projected into source-pixel coordinates $[0, W] \times [0, H]$ before any geometry logic executes.
3. **4-State Camera Arbitration Machine**:
   - States: `HOLD`, `TRACK`, `PAN`, `CUT`.
   - Transitions employ deadbands ($3\%$ displacement threshold) and temporal hysteresis ($1.8\text{ s}$ minimum dwell) before switching camera focus.

## Consequences
- **Positive**: 0 head cutoffs, 0 chin cutoffs, and 0 subtitle breaches across all evaluated benchmark corpora.
- **Negative**: Adds state tracking across frames requiring sequential keyframe generation rather than stateless map-reduce.
