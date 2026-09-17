---
status: archived
owner: clipping-core
last_reviewed: 2026-09-17
---

# Long-Form Video Duration Hardening Acceptance Decision

> **Scope**: Acceptance sign-off for frame-accurate duration extraction, stream reconciliation, and container boundary alignment on videos $> 30\text{ minutes}$.  
> **Evidence**: Raw measurement logs preserved in [`benchmarks/reports/long_form/`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/long_form/).

---

## 1. Acceptance Conclusion

The Long-Form Duration Hardening subsystem is **ACCEPTED AND FROZEN**.

The system satisfies all hard gating invariants:
1. **Container vs Stream Alignment**: Absolute variance between container metadata duration and packet-counted stream duration does not exceed $80\text{ ms}$.
2. **Audio/Video Stream Alignment**: FFmpeg filtergraph handles PTS offsets at start/end without dropped frames or truncated audio tails.
3. **Chunk Boundary Accuracy**: Candidate clipping boundaries snap cleanly to nearest keyframes (I-frames) or exact audio zero-crossings within $\pm 20\text{ ms}$.

---

## 2. Invariants & Acceptance Gates

| Gate ID | Criterion | Threshold | Result |
| :--- | :--- | :--- | :--- |
| **LF-01** | Duration probe variance | $\le 80\text{ ms}$ | **PASSED** (P95: $12\text{ ms}$) |
| **LF-02** | Stream tail truncation | 0 lost audio/video packets | **PASSED** |
| **LF-03** | Transcode time stability | Linear scaling with duration ($R^2 > 0.98$) | **PASSED** |

---

## 3. Related Code & Historical Reference

- Implementation: `apps/api/src/workers/stages/IngestionStage.ts`, `packages/clipping-core/src/contracts/ArtifactValidator.ts`
- Forensic Investigation: [`docs/archive/forensic/LONG_FORM_DURATION_FORENSIC.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/LONG_FORM_DURATION_FORENSIC.md)
- Raw Measurement Evidence: [`benchmarks/reports/long_form/LONG_FORM_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/long_form/LONG_FORM_ACCEPTANCE_REPORT.md)
