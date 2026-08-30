# V5.7 REWARD MODEL CONTRACT
# Excerpt — Advanced Intelligence Generation

> **Status**: COMPLETE
> The Reward Model introduces ML-based scoring of output clips to predict engagement, retention, and virality. It adheres strictly to the pure logic isolation of the core clipping engine.

## 1. Schema Definitions (RM-4)

The core `RewardSignal` tracks normalized values `[0.0 - 1.0]` across specific dimensions:
- `retentionProbability`
- `viralityScore`
- `pacingQuality`

All signals are permanently branded with their generating `modelSchemaVersion` (e.g. `v5.7.0`). This is an absolute requirement for downstream ML-training data-lakes to prevent cross-contamination when prompts or models are updated.

## 2. Invariant: Strict Bounding (RM-1)
Because Large Language Models (LLMs) can hallucinate format boundaries, `clipping-core` strictly enforces bounding math on the output schema.
If an LLM yields a `viralityScore` of `1.5`, the core `RewardValidator` explicitly intercepts the output and throws a `PipelineError.ValidationError`. 

## 3. Invariant: I/O Isolation (RM-2)
The invocation of the ML model is strictly an I/O bound event. The `RewardModelEngine` executes entirely within the `@excerpt/video-worker` package. The pure `ClipRanker` strictly consumes pre-computed `RewardSignals` and performs zero network lookups itself.

## 4. Invariant: Graceful Fallback (RM-3)
The Reward Model is not a mandatory dependency for job completion.
If the ML model call exceeds the explicit timeout window (`15,000ms`), or if the LLM hallucinates un-parseable JSON causing `RewardValidator` to throw, the parent job does **NOT** fail.
Instead, the `RewardModelEngine` catches the error, generates a neutral `0.5` composite fallback reward, and tags the result with `isFallback: true`. 
This guarantees the pipeline can continue to standard Ranker evaluation without losing the 5GB download investment.
