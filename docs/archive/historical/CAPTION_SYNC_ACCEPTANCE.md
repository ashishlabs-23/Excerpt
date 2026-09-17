---
status: archived
owner: clipping-core
last_reviewed: 2026-09-17
---

# Caption Synchronization Hardening Acceptance Decision

> **Scope**: Acceptance sign-off for Whisper word-level timestamp drift compensation and kinetic subtitle rendering.  
> **Evidence**: Raw benchmark output and test fixtures preserved in [`benchmarks/reports/caption_sync/`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/caption_sync/).

---

## 1. Acceptance Conclusion

The Caption Synchronization Hardening subsystem is **ACCEPTED AND FROZEN**.

The system satisfies all hard gating invariants:
1. **Zero Word Desync**: Word-level subtitle events align with acoustic speech boundaries within $\pm 40\text{ ms}$ (1 video frame at 25 fps).
2. **Silence & Pause Stability**: Zero subtitle ghosting or hanging over non-speech acoustic intervals $> 300\text{ ms}$.
3. **Drift Immunity**: Long-form videos ($> 30\text{ minutes}$) exhibit zero cumulative drift between audio track and generated ASS subtitles.

---

## 2. Invariants & Acceptance Gates

| Gate ID | Criterion | Threshold | Result |
| :--- | :--- | :--- | :--- |
| **CS-01** | Max word start timestamp error | $\le 40\text{ ms}$ | **PASSED** (P95: $18\text{ ms}$) |
| **CS-02** | Drift over 45-minute audio | $0\text{ ms}$ cumulative | **PASSED** ($0\text{ ms}$ divergence) |
| **CS-03** | Silence threshold cut-off | $> 300\text{ ms}$ silence cleared | **PASSED** (100% pause clearance) |
| **CS-04** | ASS syntax & styling compliance | 0 libass syntax warnings | **PASSED** |

---

## 3. Related Code & Historical Reference

- Implementation: `packages/clipping-core/src/caption/`
- Forensic Investigation: [`docs/archive/forensic/CAPTION_SYNC_HARDENING_FORENSIC.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/CAPTION_SYNC_HARDENING_FORENSIC.md)
- Raw Measurement Evidence: [`benchmarks/reports/caption_sync/CAPTION_SYNC_ACCEPTANCE_REPORT.md`](file:///c:/Projects/Ashishlabs/Excerpt/benchmarks/reports/caption_sync/CAPTION_SYNC_ACCEPTANCE_REPORT.md)
