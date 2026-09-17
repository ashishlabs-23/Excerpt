---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Test Strategy

This document defines the testing pyramid, verification levels, and automated execution standards for Excerpt.

---

## 1. Testing Pyramid

```text
       ▲
      / \     Real-Video Benchmarks (P6 Framing, Editorial Scorecards)
     /   \    E2E Pipeline Integration (Empty sweep, Live storage reconciliation)
    /     \   Subsystem Acceptance Tests (Retention 20/20, Duration, Caption Sync)
   /       \  Unit Tests (Math, Geometry, Bounding boxes, Bradley-Terry, Filters)
  ───────────
```

### Level 1: Pure Logic Unit Tests
- **Location**: `packages/clipping-core/src/**/__tests__/`
- **Characteristics**: Deterministic, zero I/O, zero network, zero database.
- **Coverage Targets**: Bounding box geometry, coordinate conversions, camera mode state machines, text wrapping, rating algorithms.

### Level 2: Subsystem & State Verification
- **Location**: `apps/api/src/tests/`
- **Characteristics**: Isolated service tests with mocked or local SQLite/PostgreSQL, verifying concurrency, TOCTOU safety, retry backoff, and state machines.
- **Key Milestones**: `retentionService.test.ts` (20/20 automated checks).

### Level 3: Real-Media & Synthetic Benchmarks
- **Location**: `benchmarks/runners/`, `apps/api/scripts/benchmark_*.ts`
- **Characteristics**: Evaluates actual video sources (`corpus-01` through `corpus-07`) against physical invariants (subtitles, head room, motion velocity).

---

## 2. Execution Commands

```bash
# Run pure clipping-core unit tests
npm run test:core

# Run api subsystem tests (including retention suite)
npm run test:api

# Run P6 framing benchmark
npx tsx apps/api/scripts/benchmark_p6_framing.ts
```
