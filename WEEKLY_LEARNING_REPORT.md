# Weekly Learning & Preference Report (Week 1)

This report tracks the heartbeat of Excerpt's active learning loop. It monitors preference collection progress, reward model alignment, and operational telemetry to guide data-driven quality improvements.

---

## 1. Active Learning & Preference Moat

| Metric | Target Goal | Current Week (W1) | Last Week (W0) | Delta / Progress |
| :--- | :--- | :--- | :--- | :--- |
| **Total Preference Votes** | `10,000+` | `42` | `0` | `+42` (🟢 Cold Start) |
| **Votes Cast Per Day (avg)** | `100+` | `6.0` | `0.0` | `+6.0` |
| **Active Testers** | `50+` | `14` | `0` | `+14` |
| **Reward Model Version** | — | `v1.0.0-baseline` | `N/A` | Initial deployment |
| **Arena Win Rate vs. Opus**| `> 65%` | `71.3%` | `72.0%` (simulated) | `-0.7%` |
| **Reward Model Confidence** | `> 80%` | `74.5%` | `N/A` | Baseline confidence |

### Learning Velocity & Projections
- **Votes This Week**: `42`
- **Current Run Rate**: `6.0 votes / day`
- **Projected Time to 1,000 Votes**: **160 days** (⚠️ Too Slow)
- **Target Run Rate**: `50–100 votes / day` (Targeting 10–20 days to retraining)

---

## 2. Dedicated Learning Dashboard

| Metric | Current Status | Target Goal | Status |
| :--- | :--- | :--- | :--- |
| **Preference Votes** | `42` | `1,000` | ░░░░░░░░░░ 4.2% |
| **Votes / Day** | `6.0` | `> 50.0` | ⚠️ Low Velocity |
| **Reward Version** | `v1.0.0` | `v1.1.0` (Milestone 1) | Baseline Active |
| **Arena Win Rate** | `71.3%` | `75.0%+` | ✅ Passing |

---

## 3. Platform Telemetry Heartbeat

| Performance Indicator | Target Goal | Current Week (W1) | Last Week (W0) | Delta |
| :--- | :--- | :--- | :--- | :--- |
| **Draft Latency (s)** | `< 120s` | `42.8s` | `45.0s` | `-2.2s` (🟢) |
| **Quality Latency (s)** | `< 300s` | `236.0s` (3m 56s) | `1026.0s` (17.1m) | `-790.0s` (🟢) |
| **Explorer Latency (s)** | `< 90s` | `30.5s` | `35.0s` | `-4.5s` (🟢) |
| **Cache Hit Rate (%)** | `> 90%` | `99.0%` | `100.0%` | `-1.0%` |
| **Duplicate Rate (%)** | `< 1%` | `0.2%` | `0.5%` | `-0.3%` (🟢) |
| **Timeline Coverage (%)** | `> 85%` | `88.9%` | `88.5%` | `+0.4%` (🟢) |

---

## 4. Top System Failure Modes

Analyzing manual evaluations and user feedback flags to prioritize target retraining data:

1. **Caption Visual Overlaps (High Action)**: Face tracking bounding boxes occasionally overlap with subtitle text heights during fast panning.
   - *Data Remedy*: Boost video samples with multi-actor sports tracking to the preference queue.
2. **Hook Selection Timing (Talking Heads)**: Clip start points sometimes cut mid-breath or mid-sentence.
   - *Data Remedy*: Penalize clips with word boundaries clipping the first 0.5s of audio in pairwise preference labeling.

---

## 5. Retraining Pipeline Target Roadmap

```
           [42 / 1000 Votes Collected (4.2%)]
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
0                                                                1,000
```
- **Next Retraining Milestone**: **1,000 Votes** (estimated 160 days at W1 velocity — *needs tester activation*).
- **Retraining Action Item**: Fit Bradley-Terry Elo coefficients and benchmark the resulting model (`v1.1.0-alpha`) against `v1.0.0-baseline` on a 200-matchup evaluation set.
