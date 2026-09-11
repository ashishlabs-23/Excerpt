# UNDERSTANDING CONTRACT
# Excerpt — Temporal Understanding Engine (Step 4)

> **Status**: COMPLETE
> The understanding subsystem has been implemented in `@excerpt/understanding`. It orchestrates LLM calls to construct canonical graphs (Scene, Story, Moment, Topic) with strict validation, retry protocols, and deterministic duration-based ceilings.

## 1. Graph Typology

The system builds four distinct graph layers over the video. Every graph and sub-node is strictly typed.
- `SceneGraph`: Physical or temporal boundary changes (`setting`).
- `StoryGraph`: Narrative progression (`arc`).
- `MomentGraph`: High-impact specific slices (`impact`).
- `TopicGraph`: Conversational or thematic groupings (`topic`).

Crucially, **every** graph includes a `schemaVersion: string` from day one, guaranteeing that future pipeline steps can deterministically parse historical outputs stored in the database.

## 2. Structural Validation (No Regex Patching)

Generative AI produces malformed outputs. The `GraphValidator` enforces rigid constraints *before* any graph is accepted:
1. **Timestamp Bounds**: `startMs >= 0`, `endMs <= MediaArtifact.durationMs`, and `startMs < endMs`.
2. **Schema Compliance**: The payload must match the exact interface structure (no missing `nodes` arrays).
3. **Continuity**: Depending on the graph type (e.g. `SceneGraph`), intervals cannot physically overlap.

## 3. Corrective Retry Loop

If an LLM produces output that fails the `GraphValidator`, the `LLMOrchestrator` implements a strict **Retry-Then-Fail** protocol:
1. **Initial Failure**: Caught and logged.
2. **Corrective Prompt**: The original prompt is re-submitted with an appended payload detailing the exact validation failure (e.g., `"PREVIOUS ERROR: Your previous JSON failed validation: Node 3 endMs exceeds media duration."`).
3. **Second Failure**: Throws `PipelineError.GraphConstructionFailed`.
*The system will never attempt to use regex or string manipulation to force malformed JSON into shape.*

## 4. Bounded Duration Ceilings

Unbounded LLM generation can produce massive arrays (e.g., "hallucinating" 10,000 micro-scenes).
The `GraphCeiling` calculates a rigid limit: `maxNodes = durationMinutes * config.maxNodesPerMinute`.

If the LLM generates 150 scenes for a 1-minute video with a ceiling of 60:
1. The 150 nodes are sorted descending by `confidence`.
2. The top 60 nodes are retained.
3. The array is re-sorted chronologically.
This guarantees deterministic output sizes bounded perfectly by the input media duration.

## 5. Test Verification

5 explicit edge-cases in `understanding.test.ts` continuously assert these guarantees:
1. Negative timestamps or out-of-bounds `endMs` are rejected by the validator.
2. Scene overlapping is rejected by the validator.
3. Missing nodes/schema mismatches trigger a retry.
4. Two consecutive failures strictly throw `GraphConstructionFailed` rather than silently succeeding.
5. The `GraphCeiling` logic successfully truncates massive arrays by confidence and re-sorts them chronologically.
