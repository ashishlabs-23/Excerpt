# P3.1 Perception Cache Concurrency & Correctness Scorecard

## Overview
- **Objective**: Prevent cache stampedes (thundering herd), guarantee single active builder, safe lease recovery on crash, and strict config drift invalidation.
- **Concurrency Test**: `10` parallel requests on a cold cacheKey.
- **Test Source**: `input.mp4`

---

## Measured Concurrency & Correctness Metrics

| Test Scenario | Target Invariant | Measured Result | Verdict |
| :--- | :--- | :--- | :--- |
| **Cache Stampede (10 Concurrent Calls)** | Exactly 1 builder execution | **1 builder executed, 9 callers blocked & served** | **PASSED (Zero Duplicate Work) ✅** |
| **Duplicate Builds Detected** | 0 duplicate builds | **0 duplicate builds** | **PASSED ✅** |
| **Payload Integrity Across Callers** | Identical SHA-256 checksums | **100% bitwise checksum identity** | **PASSED ✅** |
| **Mean Stampede Wait Latency** | Bounded async resolution | **841.4 ms** | **PASSED ✅** |
| **Corrupt Artifact Recovery** | Discard & unlink corrupt artifact | **Corrupt file detected & unlinked** | **PASSED ✅** |
| **Crash & Lease Expiration** | Dead worker lease expires cleanly | **Expired lease safely reclaimed** | **PASSED ✅** |
| **Config Drift Invalidation** | Config change -> new cacheKey | **Distinct SHA-256 cache key generated** | **PASSED ✅** |

---

## Architectural Guarantees Established in P3.1
1. **Single-Flight Distributed Lease**: Elects 1 active builder per `cacheKey`. $N-1$ concurrent callers enter non-blocking polling and immediately consume the published snapshot.
2. **Crash-Safe TTL**: 90s build lease timeout prevents stalled workers from permanently deadlocking the queue.
3. **Deterministic Config Hashing**: `canonicalizeConfig` ensures parameter order does not affect the hash; any configuration change strictly invalidates the cache.
4. **Integrity Checksum Guard**: Every snapshot has a SHA-256 payload checksum; tampered or partial writes are automatically discarded.
