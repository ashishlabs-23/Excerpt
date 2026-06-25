# Dataset Gap Analysis & Priority Queue

This report identifies extreme structural deficits in the dataset to prevent Excerpt from collapsing into a standard goal detector. It directly feeds the Active Learning annotation efforts.

## Coverage Report
| Archetype | Samples | Target | Coverage | Priority |
|-----------|---------|--------|----------|----------|
| late_game_winner | 185 | 100 | 185% | LOW |
| counterattack_finish | 142 | 100 | 142% | LOW |
| individual_brilliance | 120 | 100 | 120% | LOW |
| comeback_goal | 70 | 100 | 70% | MEDIUM |
| goalkeeper_heroics | 11 | 100 | 11% | **CRITICAL** |
| controversial_decision | 8 | 100 | 8% | **CRITICAL** |
| var_reversal | 4 | 100 | 4% | **CRITICAL** |
| rivalry_flashpoint | 3 | 100 | 3% | **CRITICAL** |

## Annotation Priority Queue
The following archetypes are severely underrepresented and require immediate manual annotation generation:

1. `goalkeeper_heroics` (Missing 89 samples)
2. `controversial_decision` (Missing 92 samples)
3. `var_reversal` (Missing 96 samples)
4. `rivalry_flashpoint` (Missing 97 samples)

---
*Conclusion*: Engineering should temporarily halt development to allow the data team to source and label `goalkeeper_heroics`, `controversial_decision`, `var_reversal`, `rivalry_flashpoint` clips.*
