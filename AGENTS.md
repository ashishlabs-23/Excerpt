# AGENTS.md — Universal Agent Instructions for Excerpt

> Standardized instructions for autonomous coding agents (Copilot Agent Mode, Claude Code, Antigravity, Cursor, OpenHands).

## Project Identity
- **Repository**: Excerpt (AI Video Clipping & 9:16 Vertical Reframing Platform)
- **Monorepo Structure**: `apps/web` (Next.js 14), `apps/api` (Express/Node + Python worker), `packages/clipping-core` (TypeScript calculation core).

---

## Agent Operating Guidelines

1. **Check Before Writing**: Read `AI_CONTEXT_MEMORY.md` and relevant docs in `docs/architecture/` before planning changes.
2. **Feature Freeze Awareness**: If in a hardening phase, reject speculative feature creep. Focus on correctness, zero regression, and benchmark validation.
3. **Atomic Changes**: Modify < 15 files per task. Commit atomically with descriptive semantic messages (`feat:`, `fix:`, `refactor:`, `test:`).
4. **Always Verify**: Run deterministic validation commands after making changes. Never declare a task complete without executing tests and type checks.

---

## Core Toolchain Commands

| Task | Command |
|---|---|
| Typecheck entire workspace | `npm run typecheck` |
| Run all unit tests | `npm test` |
| Run core package tests | `npm run test --workspace=packages/clipping-core` |
| Run API subsystem tests | `npm run test --workspace=apps/api` |
| Start web frontend | `npm run dev:web` |
| Start API backend | `npm run dev:api` |

---

## Security & Environment Invariants
- Never log or commit `.env` credentials, Backblaze keys, or Supabase service tokens.
- Validate all user-supplied video URLs and uploaded file paths against traversal attacks.
- Python subprocess invocations must go through `safeSpawnPython.ts` with strict argument sanitization.
