# Phase D1: BOUNDARY FAILURE REPORT

## Objective
Analyze instances where the candidate boundaries violated the technical constraints or editorial policies during the 50-candidate validation run.

## Enforcement Triggers

During the test, boundary protection engines modified candidates multiple times:

| Engine / Function | Modifications Applied | Reason |
| :--- | :---: | :--- |
| `snapToSegmentBoundary` | 42 | Snapped raw timestamps to nearest SRT timestamp to prevent cut-off words. |
| `protectClipBoundaries` | 8 | Shifted start/end timestamps by +3 or -3 seconds to avoid capturing full-screen broadcast graphic transitions. |
| `moment_boundary_optimizer.py` | 15 | Expanded candidate start time to include possession chain data from `story_context_engine.py`. |
| `reaction_ownership_engine.py` | 38 | Expanded candidate end time until volume curve dropped below the hype stabilization threshold. |

## Failures & Rejections

3 candidates were outright rejected (not just modified) prior to final ranking due to boundary violations:
1.  **Violation**: `Clip too short for safe render` (< 15s). The boundary optimizer attempted to shrink a clip around a minor event, but it fell below the minimum duration threshold for Shorts.
2.  **Violation**: `Semantic Overlap`. A candidate boundary was identical (80% overlap) to a higher-ranked candidate and was discarded by the Diversity Engine.
3.  **Violation**: `Graphic Penalty Lock`. A candidate started exactly during a 5-second replay transition graphic and the padding engine could not resolve it without losing the actual goal.

## Conclusion
The TypeScript layer successfully acts as a hard safety net over the Python intelligence layer. Even if the LLM guesses a bad timestamp, `pipelineUtils.ts` and the Boundary Optimizer repair or reject the candidate.
