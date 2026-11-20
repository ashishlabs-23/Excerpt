# todo.md — Excerpt Task & Hardening Board

> **Workflow Rule**: 1 Task = 1 Feature/Fix = <15 Files = 1 Commit with Verification.  
> **Status Reference**: [`AI_CONTEXT_MEMORY.md`](AI_CONTEXT_MEMORY.md) (Feature Freeze Active).

---

## 🔒 Current Phase: Production Hardening & Reliability

### Active Tasks
- [x] **Task 1: Verify Type Safety Across Monorepo**
  - Command: `npm run typecheck`
  - Result: Clean build with 0 TypeScript compilation errors.
- [x] **Task 2: Pure Core Engine Unit Test Suite**
  - Command: `npm run test --workspace=packages/clipping-core`
  - Result: 12/12 suites passed, 100/100 tests passed.
- [x] **Task 3: API Intelligence & Worker Test Suites**
  - Command: `npx jest apps/api/src/tests/videoWorker.test.ts && npx jest apps/api/src/tests/v3Engines.test.ts`
  - Result: Fixed `perceptionSnapshot` worker scoping defect and tuned test fallback timeouts; all worker orchestration & intelligence tests passed.
- [x] **Task 4: Integrated 9:16 vs 16:9 Generation Selector**
  - Result: Added explicit output format selection at generation time in `UploadZone.tsx` (9:16 Vertical Shorts with PeakCut framing & captions vs. 16:9 Landscape Widescreen), wired to `/generate-clips`, `/upload`, and `videoWorker.ts`. 0 type errors.
- [x] **Task 5: Complete Incomplete Subsystems & Code Hardening**
  - Result: Implemented `OpticalFlowDetector` in `SportsAdapter.ts` using `visualTimeline.motion_score`; enabled real database candidate clip pairing in `arena.ts`; integrated live video players in `PairwiseReview.tsx`; implemented 15GB disk quota auto-eviction in `ZombieSweeperService.ts`; removed `|| true` typecheck bypass in GitHub Actions workflow; restricted mock auth tokens to non-production in `firebaseAuth.ts`.
- [ ] **Task 6: Production Verification Suite (PV-3 Consecutive Jobs)**
  - Command: `npm run test:api`
  - Acceptance: Ensure queue processes consecutive video jobs without memory exhaustion or zombie FFmpeg processes.
- [ ] **Task 7: P6 Framing Benchmark Run**
  - Command: `npx tsx apps/api/scripts/benchmark_p6_framing.ts`
  - Acceptance: 100% active speaker retention, zero framing regressions.

---

## 📋 Completed Milestones
- [x] Phase A: Editorial Intelligence (Hook + Payoff + Coherence)
- [x] Phase B: Real-Video Editorial Benchmark & Human Preference
- [x] Phase C: Contextual Director + Adaptive Framing (TalkNet MAR Lip-Motion weighting)
- [x] Phase D: Kinetic Captions + EBU R128 Loudness Audio Normalization
- [x] Context Anchors Installed (`.github/copilot-instructions.md`, `AGENTS.md`, `.coderabbit.yaml`)
