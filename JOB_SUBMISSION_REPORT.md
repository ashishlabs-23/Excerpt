# 📋 JOB_SUBMISSION_REPORT.md — Phase 2: Job Submission
**Validation Run:** 2026-06-19
**Phase:** 2 — Job Submission

---

## Submission Metadata

| Field | Value |
|---|---|
| **Job ID** | `b9f513c3-b40b-4506-b9e9-2e098cc74572` |
| **Video URL** | `https://www.youtube.com/watch?v=Mk5RqSLVE-I` |
| **Video** | Real Madrid vs Bayern München — UCL Semi-Final 2024 (Extended Highlights) |
| **Submitted At** | `2026-06-19T13:18:40 IST` (`2026-06-19T07:48:40Z`) |
| **HTTP Status** | `202 Accepted` |
| **Response** | `{"message":"Job submitted to queue","jobId":"b9f513c3-b40b-4506-b9e9-2e098cc74572"}` |
| **Auth Used** | `Bearer mock-token` (dev bypass — `requireUserJWT` middleware) |
| **User ID** | `00000000-0000-0000-0000-000000000000` (mock dev user) |
| **numClips** | 5 |
| **generationMode** | `quality` |
| **intent** | `viral` |
| **avoidSimilarClips** | `balanced` |

---

## Initial DB State (T+10s after submission)

```json
{
  "id": "b9f513c3-b40b-4506-b9e9-2e098cc74572",
  "user_id": "00000000-0000-0000-0000-000000000000",
  "status": "queued",
  "video_url": "https://www.youtube.com/watch?v=Mk5RqSLVE-I",
  "progress": 0,
  "num_clips": 5,
  "locked_by": null,
  "locked_at": null,
  "job_type": "clipping",
  "payload": {
    "intent": "viral",
    "generationMode": "quality",
    "avoidSimilarClips": "balanced"
  }
}
```

---

## Submission Challenges Documented

| Attempt | Outcome | Root Cause |
|---|---|---|
| Attempt 1 (`url` field, `Authorization: Bearer excerpt-local-dev-token-2026`) | `401 Unauthorized` | Wrong auth — static token rejected, need Supabase JWT or `mock-token` |
| Attempt 2 (`url` field, `Authorization: Bearer mock-token`) | `400 Bad Request` | Wrong field name — route expects `videoUrl`, not `url` |
| Attempt 3 (`videoUrl` field, `Authorization: Bearer mock-token`) | **`202 Accepted`** ✅ | Correct payload |

### Root Cause of Submission Failures
1. **Auth format**: The `requireUserJWT` middleware at `/api/video/generate-clips` (L478) only accepts:
   - Valid Supabase JWT (real user auth), OR
   - String `"mock-token"` (hardcoded dev bypass at `supabaseAuth.ts:50`)
   - **NOT** `API_AUTH_TOKEN` env variable
2. **Field name**: Route validator expects `videoUrl` (from `validateVideoUrlMiddleware`), not `url`
3. **API window instability**: API started via `Start-Process -WindowStyle Minimized` dies when parent context closes. Fixed by using `node dist/index.js >> logfile 2>&1` via `cmd /c`

---

## API Health at Submission Time

```
GET /health → 200 {"status":"OK","message":"Excerpt API is live"}
Boot: node dist/index.js (compiled TypeScript)
Workers: 5 concurrent pollers active
Supabase: connected
Storage: Supabase Storage (B2 degraded)
```

---

## Expected Pipeline Sequence

1. Worker polls `jobs` table, finds `queued` job
2. Sets `status = 'processing'`, `locked_by` = worker ID
3. Downloads video via yt-dlp (~10-15 min video)
4. Transcribes via Groq Whisper
5. Classifies category → `football`
6. Football Intelligence Orchestrator runs
7. Clips rendered via FFmpeg
8. Uploaded to Supabase Storage
9. `status = 'completed'`

---

*Report generated: 2026-06-19 13:19 IST*
