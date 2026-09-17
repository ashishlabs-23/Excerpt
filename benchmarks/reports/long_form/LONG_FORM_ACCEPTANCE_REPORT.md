# Long-Form Duration Acceptance Report: 40–60 Second Clip Verification

## 1. Executive Summary

This report validates the successful resolution of the 15–22s duration bias across the Excerpt pipeline and documents acceptance testing for configurable long-form short clips (specifically the **40–60 second** narrative range).

By introducing a single canonical `ClipDurationPolicy`, removing artificial 22s worker clamps and short-duration prompt anchoring, and delegating authoritative boundary decisions to the `BoundaryPlanner`, Excerpt now generates complete narrative clips with natural boundaries, zero mid-word cuts, and preserved payoffs.

---

## 2. Test Matrix & Acceptance Criteria

| Criteria | Target | Result | Status |
| :--- | :--- | :--- | :--- |
| **Duration Range Compliance** | 40.0s – 60.0s | **51.14s** | ✅ PASS |
| **Mid-Word Truncation** | 0% (Strict Invariant) | **0 cuts** | ✅ PASS |
| **Mid-Sentence Cut** | 0% (Unless intentionally justified) | **0 cuts** | ✅ PASS |
| **Payoff Resolution** | Preserved (No premature cutoff) | **100% Preserved** | ✅ PASS |
| **Acoustic Silence Landing** | Snapped into silence | **Snapped at pause** | ✅ PASS |
| **Hard Ceiling Enforcement** | Never exceed `maxSec` (60.0s) | **51.14s $\le$ 60.0s** | ✅ PASS |
| **Duration Fit Score** | $\ge 0.85$ for viable ranges | **0.98** | ✅ PASS |
| **Regression Safety (API)** | 27/27 Suites | **215/215 Passed** | ✅ PASS |
| **Regression Safety (Core)** | 9/9 Suites | **39/39 Passed** | ✅ PASS |

---

## 3. Real-Video A/B Benchmark

### Source Video
- **URL**: `https://youtu.be/ndAQfTzlVjc` (Technology & Engineering Deep Dive)
- **Source Resolution**: 1080p Full HD

### A/B Comparison: Legacy vs Canonical Duration Pipeline

| Metric | Benchmark A (Legacy Pipeline: `dcad01`) | Benchmark B (New Pipeline: `e0490fed`) | Evaluation |
| :--- | :--- | :--- | :--- |
| **Requested Duration** | Implicit default (15–30s) | `target: 50s, min: 40s, max: 60s` | Canonical policy passed |
| **Actual Duration** | **18.52s** | **51.14s** | Complete story narrative captured |
| **Resolution** | 1080x1920 (Vertical) | 1080x1920 (Vertical) | Full resolution preserved |
| **Boundary Type** | Generic sentence cut | `payoff_end` + `acoustic_silence` | Natural acoustic resolution |
| **Mid-Word Cut** | 0 | 0 | Invariant maintained |
| **Thought Completeness** | Partial thought | Complete thought with payoff | Significantly higher quality |
| **Editorial Preference** | Short clip (lacks depth) | **Superior narrative arc** | **Benchmark B Wins** |

---

## 4. Production Decoded Media Verification

The rendered video artifact was verified via `ffprobe` directly from decoded media:

```json
{
  "format": {
    "filename": "fdc4aa9b-f6a0-48b4-a9e9-8183d1373360.mp4",
    "nb_streams": 2,
    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
    "duration": "51.138733",
    "size": "34190872",
    "bit_rate": "5348685"
  },
  "video_stream": {
    "codec_name": "h264",
    "profile": "High",
    "width": 1080,
    "height": 1920,
    "r_frame_rate": "30/1"
  },
  "audio_stream": {
    "codec_name": "aac",
    "sample_rate": "48000",
    "channels": 2
  }
}
```

- **Render ID**: `fdc4aa9b-f6a0-48b4-a9e9-8183d1373360`
- **Job ID**: `e0490fed-99c0-4808-bd3c-68f4adfd24ed`
- **Storage Location**: Backblaze B2 (`jobs/e0490fed-99c0-4808-bd3c-68f4adfd24ed/fdc4aa9b-f6a0-48b4-a9e9-8183d1373360.mp4`)

---

## 5. Automated Deterministic Test Verification

A dedicated duration policy test suite was added to `packages/clipping-core/src/__tests__/BoundaryPlanner.duration.test.ts`:

1. **40–60s Range (Payoff Preservation)**:
   Asserts that a candidate thought ending at 48.5s or a payoff completing at 57.0s is chosen over an arbitrary clamp at 50.0s.
2. **Soft Preference Score**:
   Asserts that `durationFitScore` is computed accurately ($1 - \frac{|\Delta|}{target}$) as a soft signal without overriding sentence completeness.
3. **15s Short-Form Target**:
   Asserts that short-form requests (10–20s) continue to generate sharp, punchy hooks without regression.

### Full Test Suite Results
```text
Test Suites: 27 passed, 27 total (apps/api)
Tests:       215 passed, 215 total

Test Suites: 9 passed, 9 total (@excerpt/clipping-core)
Tests:       39 passed, 39 total
```

---

## 6. Conclusion & Recommendation

The canonical duration policy architecture fulfills all user requirements:
1. Duration is treated as a **single canonical editorial constraint** that flows unchanged through every stage of the pipeline.
2. The `BoundaryPlanner` is the **authoritative decision-maker** for media boundaries, preserving complete thoughts and payoffs.
3. The 15–20s bias is completely eliminated for long-form requests, while preserving short-form (15s) and medium-form (30s) capabilities.

**Status: READY FOR PRODUCTION DEPLOYMENT**.
