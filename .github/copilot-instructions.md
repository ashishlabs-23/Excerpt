# GitHub Copilot Repository Instructions: Excerpt

Welcome to **Excerpt** — an autonomous AI video clipping and 9:16 vertical viralization engine.

These instructions apply across all GitHub Copilot chat, completions, and autonomous agent tasks.

---

## 1. Monorepo Architecture & Package Boundaries

```
Excerpt/
├── apps/
│   ├── api/             # Node.js/Express + Python pipeline worker (port 8010)
│   └── web/             # Next.js 14 App Router dashboard (port 3000)
├── packages/
│   └── clipping-core/   # Pure deterministic engines (framing, math, timeline calculation)
├── benchmarks/          # Ground-truth test corpora and performance metrics
└── docs/                # Canonical documentation & Architectural Decision Records (ADRs)
```

### Boundary Rules
- **Pure Logic**: Any pure algorithms, framing computations, or subtitle formatting MUST reside in `packages/clipping-core` and remain side-effect free.
- **No Circular Dependencies**: `packages/clipping-core` must never import from `apps/*`.
- **Runtime Environment**: Do not assume global Linux paths. The codebase supports Windows and POSIX environments. Use `safeSpawnPython.ts` or path utilities when spawning Python child processes.

---

## 2. Non-Negotiable Invariants (DO NOT COMPROMISE)

When modifying or refactoring video processing or framing code, enforce these three architectural invariants:

1. **TalkNet Active Speaker MAR Lip Motion Weighting (`unified_crop_planner.py` / framing engines)**:
   - Mouth Aspect Ratio (MAR) activity weighting (`mar_activity * 3.5`) MUST heavily outweigh raw face size (`area * 0.5`).
   - *Never* calculate active face focus purely on face size.

2. **High-Fidelity 1080p Broadcast Quality (`VideoProcessor.ts` / ffmpeg scripts)**:
   - Render outputs MUST use `cropWidth = 1080`, `cropHeight = 1920` (Full HD 9:16 vertical).
   - Encoding flags: `-crf 17` (Visually Lossless), `-preset medium`, `-level 4.2`, and `-maxrate 12M -bufsize 16M`.
   - Never downgrade to draft 720p or ultrafast presets for final delivery clips.

3. **Instant Dashboard Video Playback Streaming (`video.ts` / API handlers)**:
   - Video endpoints MUST implement HTTP 206 Partial Content byte-range streaming.
   - Search both `clips/` and `temp/${jobId}/` candidate directories for local clip files without triggering 302 redirects.

---

## 3. Coding & Verification Standards

- **Strict TypeScript**: Avoid `any`. Define Zod schemas or explicit interfaces for data crossing process boundaries (e.g., Python stdout JSON $\rightarrow$ Express).
- **No Swallowed Errors**: Never use `catch (e) {}` or shell `|| true` in CI scripts. Every exception must be logged or propagated with contextual details.
- **No Stub/Mock Code in Production**: Do not emit `// TODO: implement later` or placeholder responses.
- **Verification Commands**:
  - Test core logic: `npm run test --workspace=packages/clipping-core`
  - Test API: `npm run test --workspace=apps/api`
  - Full TypeScript build: `npm run typecheck`
