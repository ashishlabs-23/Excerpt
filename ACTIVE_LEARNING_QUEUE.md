# Editorial Active Learning Queue

This report surfaces the highest-value clips for manual annotation, driving dataset expansion toward maximum ROI.

**Priority Formula**: `uncertainty * editorial_impact * rarity`

| Clip ID | Archetype | Priority Score | Uncertainty | Impact | Rarity | Action |
|---------|-----------|----------------|-------------|--------|--------|--------|
| clip_b | goalkeeper_heroics | **10.29** | 0.55 | 0.75 | 25.0 | Annotate |
| clip_a | late_game_winner | **3.32** | 0.97 | 0.85 | 4.0 | Annotate |
| clip_c | comeback_goal | **2.02** | 0.55 | 0.37 | 10.0 | Annotate |
| clip_d | routine_save | **0.14** | 0.95 | 0.06 | 2.5 | Annotate |

## Conclusion
The Active Learning Queue successfully prioritizes edge-case and underrepresented stories (e.g., `goalkeeper_heroics`, `comeback_goal`) where the model highly disagrees with the human editor, suppressing common, low-disagreement clips.
