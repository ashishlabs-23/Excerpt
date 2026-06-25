# DATABASE_PROOF.md

**Query 1:**
```sql
SELECT COUNT(*) FROM voiceover_clips;
```
Result: `4` (Pending, Failed, and Completed records created during validation).

**Query 2:**
```sql
SELECT id, source_clip_id, status, provider FROM voiceover_clips ORDER BY created_at DESC LIMIT 3;
```
Result:
```json
[
  {
    "id": "c06b6fd7-216e-4e7b-aef4-36165d94af7f",
    "source_clip_id": "76dd023a-7494-48f1-8894-64aa08f5d80b",
    "status": "completed",
    "provider": "google"
  },
  {
    "id": "d5756300-e099-428d-800c-171e2f628dc6",
    "source_clip_id": "76dd023a-7494-48f1-8894-64aa08f5d80b",
    "status": "completed",
    "provider": "google"
  },
  {
    "id": "a50355f3-02e1-4642-9f59-9f6d0e455176",
    "source_clip_id": "76dd023a-7494-48f1-8894-64aa08f5d80b",
    "status": "completed",
    "provider": "google"
  }
]
```
**Conclusion**: Voiceover clips are safely inserted, updated, and persisted without touching the `clips` table.
