# SYSTEM BOOT REPORT (Phase 1)

This report captures the runtime commands and log outputs from initializing Excerpt's services.

## Services Started
1. **Frontend (Next.js):** http://localhost:3000 (Started via `npm run dev -w apps/web`)
2. **Backend (Express API):** http://localhost:8010 (Started via `npx tsx watch src/index.ts`)
3. **Queue Workers:** Polling active with Concurrency 5 (Started via `npx tsx apps/api/src/workers/videoWorker.ts`)

## Commands Executed
- Root startup: `npm run dev` in `C:\Projects\Ashishlabs\Excerpt`

## Startup Diagnostics

### Express API Server Log (`api_v8.log`)
```text
> api@1.0.0 dev
> npx tsx watch src/index.ts

◇ injecting env (0) from .env
◇ injecting env (41) from ..\..\.env
[StorageService]: Invalid or failing B2 credentials. Will bypass B2 and use Supabase Storage.
[QueueService]: Cloud-First Supabase Queue initialized
[Server]: Excerpt API is running on http://0.0.0.0:8010
```

### Video Queue Worker Log (`worker_v8.log`)
```text
[Worker]: Godmode Env Loaded from C:\Projects\Ashishlabs\Excerpt\.env
{"level":"info","service":"excerpt-api","msg":"[Worker]: 🚀 Gen-4 Cloud-Polling Worker Starting with Concurrency 5..."}
{"level":"info","service":"excerpt-api","msg":"[Worker-1]: 🟢 Polling started."}
{"level":"info","service":"excerpt-api","msg":"[Worker-2]: 🟢 Polling started."}
{"level":"info","service":"excerpt-api","msg":"[Worker-3]: 🟢 Polling started."}
{"level":"info","service":"excerpt-api","msg":"[Worker-4]: 🟢 Polling started."}
{"level":"info","service":"excerpt-api","msg":"[Worker-5]: 🟢 Polling started."}
```

### Warnings & Errors Identified
- **B2 Storage Warning:** `[StorageService]: Invalid or failing B2 credentials. Will bypass B2 and use Supabase Storage.` (Non-blocking fallback active).
- **Express Rate Limit ValidationError:**
  ```text
  ValidationError: Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to bypass limits.
  ```
  This is a rate-limiting package configuration warning, non-blocking for local and API execution.
