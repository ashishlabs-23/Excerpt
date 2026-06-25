# Phase E: BOUNDARY OWNERSHIP TRUTH

This report traces the exact lifecycle of a timestamp boundary to definitively answer: **Who truly owns clip boundaries?**

## The Boundary Chain of Custody

The boundary ownership is not held by a single entity, but rather moves through a pipeline of increasingly restrictive refinements.

### 1. The Seed Layer (The Initiator)
*   **Owner**: `fallbackClipService.ts` or `football_events_engine.py`
*   **Logic**: Detects a core event (e.g., "Goal") and drops a crude heuristic window (`[event_time - 10s, event_time + 10s]`).
*   **Verdict**: Owns the *location* of the clip, but not the *boundary*.

### 2. The Narrative Layer (The Extender)
*   **Owners**: `story_context_engine.py` and `reaction_ownership_engine.py`
*   **Logic**: Walks backward to find the true `story_start` (possession chain, buildup) and forward to find the `reaction_end` (crowd noise, celebration, hype stabilization).
*   **Verdict**: Owns the *ideal theoretical narrative boundary*.

### 3. The Quality Check Layer (The Rejector)
*   **Owner**: `moment_boundary_optimizer.py`
*   **Logic**: Computes the `Story Completeness Score`. It forces the candidate boundary to encompass the build-up, trigger, outcome, and reaction. If the score falls below `0.80`, it alters or rejects the candidate.
*   **Verdict**: Owns the *enforcement* of story quality.

### 4. The Transcript Layer (The Snapper)
*   **Owner**: `snapToSegmentBoundary()` in `pipelineUtils.ts`
*   **Logic**: After all AI and mathematical optimizations, this function overrides the timestamp to snap it to the nearest Word-Level transcription boundary.
*   **Verdict**: This prevents awkward mid-word cuts and owns the *audio boundary*.

### 5. The Visual Protection Layer (The Final Arbiter)
*   **Owner**: `protectClipBoundaries()` in `pipelineUtils.ts`
*   **Logic**: Evaluates the newly snapped transcript boundary against visual segments (e.g., Broadcast Graphics). If the clip starts exactly when a full-screen graphic transition occurs, it shifts the timestamp +3 seconds to avoid capturing a visual glitch.
*   **Verdict**: Owns the *final absolute frame boundary* passed to FFmpeg.

## Conclusion
The **LLM never owns the final boundary**. It acts only as a hint provider at the Seed Layer. The true owners are the **TypeScript Snapping Utilities** (`snapToSegmentBoundary` and `protectClipBoundaries`) which override all AI recommendations to ensure technical playback safety (no cut-off words, no graphic glitches).
