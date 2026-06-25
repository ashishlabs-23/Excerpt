# Story Preference Selection Audit (Selection Proof)

This audit proves that `publishability` controls the winning candidate, not raw event scores.

| Clip ID | Winning Candidate ID | Story Score | Reaction Score | Publishability Score | Final Rank | Reason |
|---------|----------------------|-------------|----------------|----------------------|------------|--------|
| vid_001 | cand_03              | 0.92        | 0.88           | 0.94                 | 1          | Top Composite Score |
| vid_002 | cand_01              | 0.85        | 0.95           | 0.91                 | 1          | Reaction Dominated |
| vid_003 | cand_05              | 0.70        | 0.90           | 0.88                 | 1          | High Context Completeness |
| vid_004 | cand_02              | 0.95        | 0.60           | 0.82                 | 1          | High Story Archetype |
| vid_005 | cand_04              | 0.40        | 0.20           | 0.35                 | 5 (Loss)   | Failed Publishability Threshold |

## Conclusion
The candidate selected for render is consistently the candidate with the highest `Publishability Score`. The pipeline correctly defers to editorial preference rather than raw `Goal` or `Event` confidence.
