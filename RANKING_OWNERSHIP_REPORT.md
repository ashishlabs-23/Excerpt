# Phase H: RANKING OWNERSHIP REPORT

This report mathematically breaks down the final winner selection logic to prove exactly why a specific story candidate wins.

## Ranking Subsystem
The final ranking is determined synchronously within the Video Worker via `rankClipCandidates()` located in `apps/api/src/services/pipelineUtils.ts`.

## The Football Formula
When the `category` is set to `'football'`, the system completely discards generic engagement metrics (like Face Detection) and computes a specialized weighted composite score:

*   **Commentary Hype**: 15%
*   **Goal Importance**: 15%
*   **Narrative Completeness**: 15%
*   **Story Completeness**: 10%
*   **Tension**: 15%
*   **Match Importance**: 10%
*   **Ball Visibility**: 10%
*   **Retention Score**: 10%

`Total Base Score = 100%`

### Dynamic Exploration Bonus
To prevent the engine from extracting 5 clips that are all identical goal replays, the system calculates a `timelineCoveragePercent`. Candidates receive an artificial score bump based on how underexplored their timeline region is:
*   < 30% coverage: `+0.20`
*   < 60% coverage: `+0.15`
*   < 80% coverage: `+0.10`
*   < 95% coverage: `+0.05`

### Tie-Breaker Resolution
If two candidates finish within 5% of each other, the system enters tie-breaker mode.
1. **Previous Winner Stability**: It prefers the candidate that won a previous identical run.
2. **Face/Hook Scores**: It falls back to face density and hook density as the ultimate arbiter.

## Conclusion: Who owns the ranking?
Ranking is **mathematically deterministic and owned entirely by the internal `pipelineUtils` heuristics**, not by an LLM prompt. The LLMs provide raw ingredient signals (like "Goal Importance"), but the final combination and mathematical sorting are strictly governed by TypeScript rules.
