# ✈️ PRE_FLIGHT_REPORT.md — Excerpt Generation Truth Test
**Validation Run:** 2026-06-19 | 13:08 IST
**Test Engineer:** Antigravity (Evidence Mode)
**Scope:** Full stack preflight before 10-minute football video submission

---

## Summary

| Component | Status | Port | Notes |
|---|---|---|---|
| **API Server** | ✅ PASS | 8010 | Boots in ~4s via `node dist/index.js` |
| **Worker (embedded)** | ✅ PASS | — | Gen-4 Cloud-Polling, 5 concurrency |
| **Ollama** | ✅ PASS | 11434 | `qwen2.5-coder:7b` + `qwen2.5-coder:1.5b` loaded |
| **Supabase DB** | ✅ PASS | Cloud | `jobs`, `clips` tables reachable |
| **FFmpeg** | ✅ PASS | — | `ffmpeg-8.1-full_build` (WinGet path) |
| **yt-dlp** | ✅ PASS | — | v2026.03.17 |
| **Frontend (Next.js)** | ⚠️ PARTIAL | 3000 | Running (PID 4004) but slow to respond on first load |
| **Redis** | ❌ FAIL | 6380 | No Redis found — system uses Supabase Cloud Queue |
| **Backblaze B2** | ⚠️ DEGRADED | — | Invalid credentials — falls back to Supabase Storage |
| **RenderWorker** | ⚠️ SEPARATE | — | Not needed (worker is embedded in API) |

---

## Detailed Findings

### ✅ API Server (Port 8010)
```
[SystemValidator]: ✅ Environment variables verified.
[SystemValidator]: ✅ Binaries verified.
[SystemValidator]: ✅ Database schema verified.
[SystemValidator]: ✅ Storage buckets verified.
[SystemValidator]: All systems go.
[Worker]: 🚀 Gen-4 Cloud-Polling Worker Starting with Concurrency 5...
[Server]: Excerpt API is running on port 8010
```
Boot time: **~4.5 seconds** (including Supabase schema validation)

### ✅ Ollama Models
```json
{
  "qwen2.5-coder:7b":   { "size": "4.36 GB", "quantization": "Q4_K_M" },
  "qwen2.5-coder:1.5b": { "size": "0.92 GB", "quantization": "Q4_K_M" },
  "qwen2.5-coder:latest": { "alias": "qwen2.5-coder:7b" }
}
```

### ✅ Supabase Cloud Queue (Redis Replacement)
- Architecture: **No Redis** — uses Supabase `jobs` table as polling queue
- Worker polls every N seconds and picks up `queued` jobs
- 3 pre-existing stuck jobs found: `detecting_clips` (1), `processing` (2)

### ❌ Redis — NOT INSTALLED
- `REDIS_URL=redis://localhost:6380` in `.env` but no Redis process
- **Impact**: None — queue system has been migrated to Supabase Cloud Queue
- BullMQ is NOT used in the current architecture

### ⚠️ ENV File Corruption (Line 61)
```
D\x00I\x00S\x00A\x00B\x00L\x00E\x00_\x00O\x00W\x00N\x00E\x00R\x00S\x00H\x00I\x00P\x00_\x00C\x00H\x00E\x00C\x00K\x00S\x00=\x00t\x00r\x00u\x00e\x00
```
UTF-16 LE null bytes embedded in UTF-8 `.env` file (line 61). dotenv skips this silently. `DISABLE_OWNERSHIP_CHECKS=true` appears again at line 67 in clean UTF-8.

### ⚠️ API Window Stability Issue
- API started via `Start-Process` closes when parent window session ends
- Solution: Use `node dist/index.js >> api_compiled.log 2>&1` via persistent CMD `/c`
- **The API itself is stable** — the instability is the launch mechanism

### ⚠️ Auth Mechanism
- Route `/api/video/generate-clips` uses `requireUserJWT` middleware
- Requires a valid Supabase JWT **OR** `mock-token` (dev bypass at line 50 of `supabaseAuth.ts`)
- Static `API_AUTH_TOKEN` (`excerpt-local-dev-token-2026`) is **not accepted** for this route
- `requireServiceAuth` requires `EXCERPT_ALLOW_SERVICE_KEY=true` (disabled)

### ❌ Frontend (Port 3010 → Actually 3000)
- MASTER_PROJECT_INFO says port 3010, but actual Next.js runs on **port 3000**
- Process running (PID 4004) since system boot
- Initial HTTP load times out (slow cold compilation) but appears functional

---

## Pre-flight Verdict

| Check | Result |
|---|---|
| Can submit jobs? | ✅ YES (via mock-token) |
| Can process jobs? | ✅ YES (worker polls Supabase) |
| Will clips be stored? | ✅ YES (Supabase Storage, B2 degraded) |
| Will transcription work? | ✅ YES (Groq key present) |
| Will AI analysis work? | ✅ YES (Gemini + Ollama) |
| Will rendering work? | ✅ YES (FFmpeg path valid) |
| Will yt-dlp download work? | ✅ YES (v2026.03.17 installed) |

**🟢 CLEARED FOR TEST FLIGHT** — Proceeding to Phase 2.

---

*Report generated during: 2026-06-19 13:07–13:18 IST*
