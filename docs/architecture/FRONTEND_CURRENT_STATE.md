# FRONTEND_CURRENT_STATE.md
# Excerpt — Frontend Architecture Current-State Audit
# Step 0 · Frontend Baseline Baseline Audit

> **Status**: AUDIT COMPLETE — Greenfield / Uninitialized Frontend Directory (`apps/web`)
> **Audit Date**: 2026-08-11
> **Auditor**: Antigravity AI

---

## Executive Summary

An audit of the repository root (`C:\Users\PC\Desktop\Excerpt`) confirms that the frontend application target directory `apps/web` **does not currently exist on disk**. The workspace is currently configured as a monorepo workspace containing `packages/*` (`clipping-core`, `ingestion`, `perception`, `shared`, `understanding`, `video-worker`).

Because `apps/web` is entirely uninitialized:
- Zero Next.js 14 App Router routes exist under `apps/web/src/app/`.
- Zero components exist under `apps/web/src/components/`.
- Zero data fetching utilities exist under `apps/web/src/lib/`.
- Zero UI handling exists for backend `VideoJobStatus` states (including `completed:partial`, `failed:*`, and `dead_letter`).
- Zero AuthGate / Supabase RLS error handlers exist.
- No `.gitignore` exists at the root or within `apps/web`.

This audit establishes the ground truth baseline and outlines the exact contract requirements, state mappings, and implementation order required before any frontend code is created in Step 0.5+.

---

## Audit Findings (Sections A – I)

### A. Route Inventory
| Route Path | File Location | Render Target | Data Dependencies | AuthGate Status | Loading / Error / Empty Handling |
|---|---|---|---|---|---|
| `/` | `apps/web/src/app/page.tsx` | *NON-EXISTENT* | None | None | None |
| `/dashboard` | `apps/web/src/app/dashboard/page.tsx` | *NON-EXISTENT* | Jobs, Clips, Analytics | None | None |
| `/upload` | `apps/web/src/app/upload/page.tsx` | *NON-EXISTENT* | API job ingestion | None | None |
| `/jobs/[id]` | `apps/web/src/app/jobs/[id]/page.tsx` | *NON-EXISTENT* | Job status, Perception, Clips | None | None |
| `/review` | `apps/web/src/app/review/page.tsx` | *NON-EXISTENT* | Rendered clip playback | None | None |
| `/arena` | `apps/web/src/app/arena/page.tsx` | *NON-EXISTENT* | Voting clip pairs | None | None |

*Summary*: All 0 routes exist. No loading skeletons, error boundaries, or zero-results empty states are currently implemented.

---

### B. Component Inventory
| Component | Directory | Route Usage | Type (Presentational vs Data/Sub) | Current Gaps |
|---|---|---|---|---|
| *None* | `apps/web/src/components/` | N/A | N/A | Directory is missing |

*Summary*: 0 UI components exist. No presentational or data-fetching components are present.

---

### C. Data Layer Inventory
| Module | Location | Targets (Endpoints / Tables) | Realtime Subscriptions | Typed API Client | Cleanup / Reconnect Behavior |
|---|---|---|---|---|---|
| `api.ts` | `apps/web/src/lib/api.ts` | *NON-EXISTENT* | None | Missing | None |
| `supabase.ts` | `apps/web/src/lib/supabase.ts` | *NON-EXISTENT* | None | Missing | None |
| `useDashboard.ts` | `apps/web/src/lib/useDashboard.ts` | *NON-EXISTENT* | None | Missing | None |
| `useRealtimeSync.ts` | `apps/web/src/lib/useRealtimeSync.ts` | *NON-EXISTENT* | None | Missing | None |

*Summary*: Raw fetch and Supabase calls are untyped and non-existent. No unified client, subscription lifecycle management, or reconnection handlers exist.

---

### D. Job-Status State Mapping Audit

The backend emits 25 distinct `VideoJobStatus` values (defined in `@excerpt/clipping-core`). The current frontend codebase has **0% coverage** for these statuses:

| Backend `VideoJobStatus` | Frontend Handling Status | Current UI Behavior | Required UI State |
|---|---|---|---|
| `created` | ❌ Unhandled | N/A | Queued indicator |
| `downloading` | ❌ Unhandled | N/A | Step 1 progress bar |
| `transcribing` | ❌ Unhandled | N/A | Step 2 progress bar |
| `perceiving` | ❌ Unhandled | N/A | Step 3 progress bar |
| `generating_candidates` | ❌ Unhandled | N/A | Step 4 progress bar |
| `ranking` | ❌ Unhandled | N/A | Step 5 progress bar |
| `planning` | ❌ Unhandled | N/A | Step 6 progress bar |
| `rendering` | ❌ Unhandled | N/A | Step 7 progress bar + clip counter |
| `validating_delivery` | ❌ Unhandled | N/A | Verification spinner |
| `validating_playback` | ❌ Unhandled | N/A | Verification spinner |
| `completed` | ❌ Unhandled | N/A | Full success view (all clips ready) |
| `completed:partial` | ❌ Unhandled | N/A | **GAP**: Must show warning badge + list usable clips |
| `failed:download` | ❌ Unhandled | N/A | Specific failure card (URL error) |
| `failed:transcription` | ❌ Unhandled | N/A | Specific failure card (Audio error) |
| `failed:perception` | ❌ Unhandled | N/A | Specific failure card (Vision error) |
| `failed:candidate_generation`| ❌ Unhandled | N/A | Specific failure card |
| `failed:no_viable_clips` | ❌ Unhandled | N/A | Specific failure card (Threshold error) |
| `failed:ranking` | ❌ Unhandled | N/A | Specific failure card |
| `failed:planning` | ❌ Unhandled | N/A | Specific failure card |
| `failed:render` | ❌ Unhandled | N/A | Specific failure card (FFmpeg error) |
| `failed:delivery_validation` | ❌ Unhandled | N/A | Specific failure card (Storage error) |
| `failed:playback_validation` | ❌ Unhandled | N/A | Specific failure card (Corrupt video) |
| `failed:artifact_unusable` | ❌ Unhandled | N/A | Specific failure card |
| `failed:persistence` | ❌ Unhandled | N/A | Specific failure card |
| `dead_letter` | ❌ Unhandled | N/A | **GAP**: Escalated support alert badge |

---

### E. Auth & RLS Audit
| Component | Location | Expired Session Handling | RLS Denial Handling | Error Display |
|---|---|---|---|---|
| `AuthGate.tsx` | `apps/web/src/components/AuthGate.tsx` | *NON-EXISTENT* | *NON-EXISTENT* | None |
| `AuthProvider.tsx` | `apps/web/src/components/AuthProvider.tsx` | *NON-EXISTENT* | *NON-EXISTENT* | None |

*Gaps*:
- Expired sessions do not redirect to login or refresh tokens cleanly.
- RLS query denials (e.g., 403 / 42501 Postgres error) will crash or render blank screens without explicit permission error bounds.

---

### F. Repo Hygiene Violations
1. **`apps/web/node_modules_old_web`**: Not present on disk. (Must be explicitly added to `.gitignore`).
2. **`public/clips/*.mp4`**: Not present on disk. Count = 0, Size = 0 MB. (Must be explicitly added to `.gitignore`).
3. **`.gitignore` file**: **MISSING**. No `.gitignore` file currently exists at the monorepo root or inside `apps/web`.

---

### G. Loading / Error / Empty State Audit
Across all planned routes (`/`, `/dashboard`, `/upload`, `/jobs/[id]`, `/review`, `/arena`):
- **Initial Loading**: 0 Skeletons or Spinners implemented.
- **Zero-Results Empty State**: 0 Empty state views implemented.
- **Network / Query Error**: 0 Error boundaries or toast notifications implemented.
- **Realtime Disconnect State**: 0 Disconnect banners or auto-reconnect UI indicators implemented.

---

### H. Accessibility Spot-Check
- **Keyboard Navigation**: 0 Focus rings, `tabIndex`, or ARIA landmark roles configured.
- **Alt Text**: 0 Thumbnail `alt` attributes present.
- **Color Contrast**: 0 WCAG 2.1 AA compliant status badge styling tokens defined.

---

### I. Bundle & Performance Red Flags
- **Oversized Client Bundles**: Framer Motion, GSAP, and Supabase JS are not yet configured with dynamic imports (`next/dynamic`) or route-level code splitting.
- **Video Elements**: 0 `<video>` elements configured with `preload="none"` or lazy loading.
- **Image Optimization**: No `next/image` usage established; raw `<img>` risks unoptimized asset loading.

---

## Required Summary & Conclusions

### 1. Confirmed Current Architecture
- Workspace: npm/pnpm monorepo containing `packages/*` (`clipping-core`, `ingestion`, `perception`, `shared`, `understanding`, `video-worker`).
- Frontend App: **Greenfield / Missing** (`apps/web` directory does not exist).
- Framework target: Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase JS, Framer Motion, GSAP.

### 2. Repo Hygiene Violations
- **Missing Root `.gitignore`**: No git exclusion rules established for `node_modules`, `.next`, `node_modules_old_web`, or media binaries (`public/clips/*.mp4`).
- **Media Binaries & Legacy Modules**: Must be barred from git tracking prior to frontend initialization.

### 3. Job-Status Mapping Gaps
- All 25 `VideoJobStatus` values currently have zero UI representation.
- Critical gap: `completed:partial` must render a distinct warning banner displaying surviving clips rather than collapsing into `completed` or `failed`.
- Critical gap: `dead_letter` status must render an escalation support badge.
- Granular failure states (`failed:download`, `failed:playback_validation`, etc.) must render specific recovery suggestions rather than generic error cards.

### 4. Missing Contracts
- **Typed API Client**: Single canonical API client wrapping backend fetch/Supabase calls with strict TypeScript types.
- **Error Taxonomy**: Frontend Error Boundary mapping `PipelineError` codes to user-friendly messages.
- **Loading & Empty State Contract**: Mandatory `loading.tsx`, `error.tsx`, and empty-state patterns per route.

### 5. Missing Tests
- 0 unit tests for UI components.
- 0 state mapping tests for `VideoJobStatus` renderer.
- 0 E2E flows (Playwright/Cypress) for upload, dashboard, review, and arena.

### 6. Highest-Risk Gaps (Ranked)
1. **CRITICAL**: Complete absence of `apps/web` directory structure and base Next.js configuration.
2. **HIGH**: Unhandled `VideoJobStatus` enum values (specifically `completed:partial` and `dead_letter` collapsing into undefined states).
3. **HIGH**: Missing AuthGate / RLS error handling (expired sessions causing silent blank screens).
4. **MEDIUM**: Missing `.gitignore` hygiene configuration for media assets and legacy `node_modules`.
5. **MEDIUM**: Unoptimized client bundle overhead (loading heavy animation libraries on static routes).

### 7. Recommended Implementation Order
1. **Step 0.5 — Monorepo & App Initialization**: Initialize `apps/web` (Next.js 14 App Router), setup `.gitignore`, configure Tailwind & TypeScript workspaces.
2. **Step 1 — Auth & Data Layer Foundation**: Implement `AuthProvider`, `AuthGate`, Supabase client, and typed API wrapper.
3. **Step 2 — Status Mapping Engine**: Implement pure status renderer supporting all 25 `VideoJobStatus` values (with explicit `completed:partial` and `dead_letter` handling).
4. **Step 3 — Core Routes & UI Layout**: Implement `/dashboard`, `/upload`, `/jobs/[id]`, `/review`, `/arena` with loading skeletons, error boundaries, and empty states.
5. **Step 4 — Realtime & Performance**: Add Supabase Realtime subscriptions with unmount cleanup, lazy video loading, and accessibility enhancements.

---

> [!STOP]
> **STOP AFTER THE AUDIT.** Do not proceed to Step 0.5 until this audit is reviewed and approved by the user.
