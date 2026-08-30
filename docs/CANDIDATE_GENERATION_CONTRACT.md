# CANDIDATE GENERATION CONTRACT
# Excerpt — Clip Candidate Generation Engine (Step 5)

> **Status**: COMPLETE
> The candidate generation subsystem strictly complies with Architectural Invariant 1. It explicitly separates AI-driven, I/O-heavy segment scoring (`SignalScorer`) from the pure, zero-I/O candidate selection logic (`CandidateGenerator`).

## 1. Architectural Split (Invariant 1)

**`SignalScorer` (I/O BOUND)**:
Located in `apps/api/src/workers/videoWorker` (or equivalent worker package), this class handles network calls to external AI models to evaluate Hook Strength, Narrative Completeness, Curiosity Gaps, etc.
- **Rules**: Wraps all calls in `runWithTimeout`, logs heavily, and tracks every LLM invocation against the `CostLedger`.

**`CandidateGenerator` (ZERO-I/O)**:
Located strictly inside `@excerpt/clipping-core`, this class takes the raw `ScoredSegment[]` produced by the Scorer and deterministically applies hard constraints to yield final `ClipCandidate[]`.
- **Rules**: It relies exclusively on mathematical filtering. The test suite forcibly poisons global network methods to guarantee that `CandidateGenerator.generate()` can never execute network I/O.

## 2. Thresholding and NoViableCandidates

Candidate generation cannot silently swallow failures or return empty arrays that allow the pipeline to proceed into a vacuous rendering phase.

If zero segments meet the defined `acceptanceThreshold` (or duration bounds):
1. The `CandidateGenerator` stops execution immediately.
2. It explicitly throws `PipelineError.NoViableCandidates`.
3. The surrounding worker explicitly transitions the parent job to a terminal `failed:no_viable_clips` state.

## 3. Deduplication Logic

The prompt mandated an explicit deduplication protocol, forbidding vague "remove duplicates" phrasing.
- **Overlap Threshold**: If two valid candidate segments share more than **60%** temporal overlap (relative to the duration of the segment being evaluated), they are considered duplicates.
- **Resolution**: Because the array is pre-sorted by `totalScore` descending, the higher-scoring segment is always retained, and the lower-scoring duplicate is permanently dropped.

## 4. Constraint Handling (Invariant 9)

**Requested != Accepted**.
If the user's `CandidateConstraints` requests 5 clips, but only 2 clips clear the strict acceptance threshold, the generator returns exactly 2. It will never synthesize or pad the return array with low-quality clips to meet a quota.

## 5. Test Verification

4 explicit edge-cases in `candidates.test.ts` continuously assert these guarantees:
1. `CandidateGenerator` acts as a pure mathematical function. A `jest` hook dynamically poisons `global.fetch` to ensure zero hidden I/O calls execute.
2. Overlap thresholding successfully filters out >60% duplicates while retaining smaller overlaps.
3. Zero segments meeting the threshold strictly throws the `NoViableCandidates` error rather than returning `[]`.
4. Invariant 9 is upheld (requested 5, valid 2 -> exactly 2 returned).
