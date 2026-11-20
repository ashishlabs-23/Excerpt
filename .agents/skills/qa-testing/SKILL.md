---
name: qa-testing
description: Comprehensive End-to-End, Integration, API, Unit, Performance, and Security Quality Assurance (QA) testing protocol. Enforces the test pyramid, automated test matrix design, boundary fuzzing, regression detection, and deterministic verification.
---

# QA Testing & Verification Skill

This skill guides coding agents through designing, executing, and reporting rigorous software Quality Assurance (QA) suites across complex full-stack media, AI, and distributed applications.

---

## 1. The QA Test Pyramid Architecture

Every feature or release must be validated across 5 distinct tiers:

```
          / \
         / E2E \        Tier 5: End-to-End User Journeys (UI -> API -> Worker -> Artifact)
        /-------\
       / Integr. \      Tier 4: Subsystem & Multi-service Integration (DB, Storage, Queue)
      /-----------\
     /     API     \    Tier 3: REST / WebSocket Contract & Error Fuzzing (Status codes, payloads)
    /---------------\
   /   Domain / AI   \  Tier 2: Algorithmic & Model Inference Benchmarks (Golden sets, scoring)
  /-------------------\
 /      Unit Tests     \ Tier 1: Pure Function Invariants (Math, boundary snappers, parser edge cases)
/-----------------------\
```

---

## 2. Testing Dimensions & Invariant Checklist

### A. Functional Correctness
- **Happy Path**: Verifies that standard inputs produce expected outputs within specified latency bounds.
- **Negative Path**: Rejects invalid payloads, malformed JSON, out-of-range timestamps, and corrupt file formats with appropriate HTTP 4xx status codes.
- **Boundary & Edge Cases**:
  - Empty lists, 0-second durations, 1-frame videos, 4K 120fps inputs.
  - Special characters, emoji titles, unicode transcript strings.
  - Video clips crossing segment boundaries or audio silence gaps.

### B. Security & Sanitization
- **Path Traversal**: Rejects `../`, absolute paths, symlinks, and UNC network shares.
- **Command Injection**: Zero bare shell spawns (`child_process.exec`). All CLI invocations must use strict array arguments with `execFile` or `spawn` without `shell: true`.
- **Credential Safety**: No leakage of bearer tokens, Supabase service keys, or cloud storage keys in client-side bundles, API responses, or logs.
- **Auth Guarding**: Mock or bypass tokens strictly blocked in production (`NODE_ENV === 'production'`).

### C. Performance & Resource Bounds
- **Memory Leaks**: Ensure long-running workers release memory after processing large video files (garbage collection, stream unpipe).
- **Process Zombie Prevention**: Ensure FFmpeg and Python child processes are cleanly killed on timeout or client disconnect.
- **Disk Quota Enforcement**: Monitor temporary directories and assert that stale or oversized temp files are evicted under quota pressure.

### D. Visual & Media Standards (Specific to Video/Audio)
- **Aspect Ratio Fidelity**:
  - `9:16`: Output strictly 1080x1920 with safe zone adherence (no text obscured by mobile UI).
  - `16:9`: Output strictly 1920x1080 preserving original framing without forced vertical cropping.
- **Encoding Profile**: H.264/AAC, CRF 17-20 high visual fidelity, `yuv420p` pixel format for cross-platform compatibility.
- **Audio Loudness**: Normalization to EBU R128 (-14 to -16 LUFS), zero audio clipping or distortion.

---

## 3. Standard QA Test Matrix Template

When designing a test plan for any feature or project, compile a deterministic matrix:

| ID | Tier | Target Area | Test Scenario | Input / Action | Expected Result | Verification Command |
|---|---|---|---|---|---|---|
| `TC-01` | Unit | Core Logic | Silence Snapping | Audio RMS with 0.4s pause | Cut snaps to silence midpoint | `npm test` |
| `TC-02` | API | Ingestion | Malformed URL | `POST /upload { url: 'file:///etc' }` | HTTP 400 Bad Request | `curl -i ...` |
| `TC-03` | E2E | Web UI | 9:16 Aspect Toggle | Select 9:16 + Fit Blur | Generation payload has `aspectRatio: '9:16'` | Browser devtools / E2E |

---

## 4. Execution & Triage Protocol

1. **Pre-flight**: Run static analysis and compiler checks (`npm run typecheck`).
2. **Execute Fast Tier 1 & 2**: Run pure unit tests with zero I/O (`npm test`).
3. **Execute Tier 3 (API Contracts)**: Spin up API in test mode and run endpoint validations.
4. **Execute Tier 4 & 5 (Integration/E2E)**: Run worker and browser journeys.
5. **Report & Regression Guard**: Log pass/fail counts, capture failure logs, and prevent commits on failing tests.
