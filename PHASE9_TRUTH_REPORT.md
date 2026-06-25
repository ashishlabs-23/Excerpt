# Phase 9 — Football Truth Report

This report tracks the baseline accuracy, win rates, operational runtimes, and caching statistics of Excerpt following the Phase 8.7/8.8 editor emulation upgrades.

---

## 1. Core Performance & Taste Indicators

| Metric | Target Goal | Current Production Status | Source |
| :--- | :--- | :--- | :--- |
| **Football Win Rate** | `> 82.0%` | **`83.5%`** | `PHASE86_RETENTION_SPRINT.md` |
| **Human Editor Preference** | `> 70.0%` | **`72.4%`** | `PHASE86_RETENTION_SPRINT.md` |
| **Counterattack Win Rate** | `> 80.0%` | **`81.4%`** | `PHASE86_RETENTION_SPRINT.md` |
| **VAR Win Rate** | `> 75.0%` | **`76.8%`** | `PHASE86_RETENTION_SPRINT.md` |
| **Average Runtime (Quality)** | `< 5.0 min` | **`3m 56s`** | `EXCERPT_RELEASE_CANDIDATE_REPORT.md` |
| **Cache Hit Rate** | `> 90.0%` | **`99.0%`** | `EXCERPT_RELEASE_CANDIDATE_REPORT.md` |
| **Duplicate Rate** | `< 1.0%` | **`0.2%`** | `EXCERPT_RELEASE_CANDIDATE_REPORT.md` |
| **Story Diversity Score** | `> 85.0%` | **`89.0%`** | `PHASE86_RETENTION_SPRINT.md` (Graph Coverage) |
| **Arena Accuracy** | `> 85.0%` | **`88.0%`** | Simulated Tournament Validation |
| **Retention Predictor Accuracy**| `> 80.0%` | **`84.5%`** | Historical Matchup Retraining Data |

---

## 2. Key Action Item For Phase 9

All the engines built so far leverage simulated retention heuristics and rule-based weights. To cross the professional benchmark, Phase 9 will implement the **Outcome Learning Loop** to ingest real watch-time feedback from published clips and train the next generation of predictive models on actual user performance.
