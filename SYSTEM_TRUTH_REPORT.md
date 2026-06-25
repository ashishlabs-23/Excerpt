# Phase A: SYSTEM TRUTH REPORT

This report classifies every active subsystem in the Excerpt stack based exclusively on verified runtime evidence, active task execution, and log inspection.

## Subsystem Classification Scale
0 = DEAD | 1 = EXISTS | 2 = EXECUTES | 3 = CONSUMED | 4 = INFLUENCES OUTPUT | 5 = CRITICAL DEPENDENCY

---

## Subsystem Audit Results

### 1. API (Node.js/Express)
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Task 265 (`npx tsx src/index.ts`) is running. Responds with HTTP 200 on `http://localhost:8010/health`. Required to push jobs onto the processing queue.

### 2. Frontend (Next.js)
* **Status**: `[2] EXECUTES`
* **Evidence**: Task 481 (`npm run dev`) is running. Responds with HTTP 200 on `http://localhost:3000`. Does not yet block background AI or Video Workers, making it a level 2 dependency for the core intelligence pipeline.

### 3. Video Workers
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Task 463 is actively polling. Runtime logs confirm it executes the complete pipeline loop (`detecting_clips` → `cutting` → `completed`).

### 4. Queue Service
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Handles job distribution and state locking. Job transitions from `queued` to `completed` in `task-459` prove active polling and state management are functioning.

### 5. Supabase (Database & Realtime)
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Active DB connections verified via `queueService.ts`. Essential for tracking job transitions and gallery data.

### 6. Supabase (Storage)
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Final clip upload URLs (e.g., `https://toaswvjvmphyltwkxvga.supabase.co/storage/v1/object/sign/clips/...`) verified in job completion payload.

### 7. Intelligence Orchestrator (Python)
* **Status**: `[4] INFLUENCES OUTPUT`
* **Evidence**: Python child processes are spawned to provide candidate windows. It is a level 4 instead of 5 because `fallbackClipService.ts` can generate fallback candidates if the Python orchestrator fails or times out.

### 8. FFmpeg (Video/Audio Processor)
* **Status**: `[5] CRITICAL DEPENDENCY`
* **Evidence**: Log timestamps prove it executes scale, crop, and ASS subtitle rendering filters, accounting for the vast majority of execution time.

### 9. LLMs (Ollama / Gemini / Groq)
* **Status**: `[4] INFLUENCES OUTPUT`
* **Evidence**: The AI orchestrator depends on these APIs for reasoning. If they are unreachable, the system relies on heuristic fallbacks (which was documented in the recent `d70e5e1d` run warnings: *AI services were unavailable or fell back to recovery mode*).

---

## Conclusion
The core production pipeline (API → Queue → Worker → FFmpeg → Supabase) is completely operational and stable. The primary instability lies in the Intelligence Orchestrator and LLM layer, which occasionally time out or fail, forcing the system into heuristic fallback modes.
