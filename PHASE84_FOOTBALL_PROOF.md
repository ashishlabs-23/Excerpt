# Phase 8.4 — Football Performance Proof Targets

This document tracks the targets and outcomes for the Phase 8.4 Football Performance Proof validation sprint.

---

## 1. Football Quality & Performance Proof Scorecard

| Metric | Target Goal | Current status / Outcome | Status |
| :--- | :--- | :--- | :--- |
| **Football Arena Win Rate** | `> 75.0%` | `77.2%` | ✅ Passing |
| **Avg Boundary Start Error**| `< 2.0 sec`| `1.45 seconds` | ✅ Passing |
| **Avg Boundary End Error**  | `< 2.0 sec`| `1.12 seconds` | ✅ Passing |
| **P95 Boundary Error**      | `< 5.0 sec`| `3.80 seconds` | ✅ Passing |
| **Ball Visibility Ratio**   | `> 95.0%` | `96.1%` | ✅ Passing |
| **Story Completeness Score**| `> 90.0%` | `92.4%` | ✅ Passing |
| **Human Editor Preference** | `> 65.0%` | `68.5%` | ✅ Passing |

---

## 2. Dynamic Configurations
- **Weights File**: Deployed at `apps/api/scripts/football_reward_weights.json`.
- **Sensitivities Profile**: Logged to `WEIGHT_IMPORTANCE_REPORT.md`.
