# Editor Preference Dashboard

The ultimate metric representing Excerpt's transition to a fully editorial intelligence platform.
It answers a single question: **"In a blind test, which clip would an editor publish?"**

---

### North Star Metric
# Editor Preference Win Rate: 80.0%

*Target: >80%*

### High ROI Health Metric
# Editorial Memory Coverage: 45.0%

*Target: >70%*
*This tells us whether the memory system is actually learning reusable editorial knowledge.*

---

## Publishability Scoring Weights
The `publishability_score` determines candidate selection using the following learned weights:
- **0.25** Story Archetype
- **0.20** Emotional Payoff
- **0.20** Reaction Intelligence (Crowd, Bench, Player)
- **0.15** Event Importance
- **0.10** Context Completeness
- **0.10** Novelty

---

## Editorial Memory & Archetype Coverage
This table tracks the maturity of our memory engine across structural storylines. It dictates dataset expansion priorities.

| Archetype | Coverage | Win Rate | Disagreement | Memory Confidence | Status |
|-----------|----------|----------|--------------|-------------------|--------|
| `late_game_winner` | 95% | 88% | 12% | 0.91 | **Production Prior** |
| `individual_brilliance` | 92% | 85% | 15% | 0.88 | **Production Prior** |
| `comeback_goal` | 73% | 70% | 30% | 0.61 | *Candidate* |
| `controversial_decision` | 25% | 40% | 60% | 0.22 | *Observed* |
| `rivalry_flashpoint` | 11% | N/A | N/A | 0.08 | *Unverified* |
| `goalkeeper_heroics` | 5% | N/A | N/A | 0.02 | *Unverified* |

*Action Required: Redirect Active Learning Queue to heavily sample `goalkeeper_heroics` and `rivalry_flashpoint`.*
