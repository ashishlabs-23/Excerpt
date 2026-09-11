# FRONTEND UI CONTRACTS
# Excerpt — Design System & State-Handling Primitives (Step 1)

> **Status**: COMPLETE & VERIFIED
> This document defines the canonical frontend primitives that govern status rendering, API calls, error boundaries, and Realtime state synchronization across `apps/web`.

---

## 1. Job Status UI Contract (`jobStatus.ts`)

Every backend `VideoJobStatus` enum value maps to a single source of truth (`JOB_STATUS_MAP` in [`apps/web/src/lib/jobStatus.ts`](file:///C:/Users/PC/Desktop/Excerpt/apps/web/src/lib/jobStatus.ts)). Ad-hoc inline status checks or inline color strings are strictly forbidden.

### Category Taxonomy
- `in_progress`: Active pipeline processing states (`downloading`, `transcribing`, `rendering`, etc.)
- `success`: `completed` (all clips valid)
- `partial_success`: `completed:partial` (some clips valid, some failed validation)
- `failure`: `failed:*` (ordinary terminal processing failures)
- `needs_attention`: `dead_letter` (retries exhausted, requires human intervention)

### Invariants
1. **`completed` vs `completed:partial`**: 
   - `completed` maps strictly to `category: 'success'`, `variant: 'success'` (Emerald Green badge).
   - `completed:partial` maps strictly to `category: 'partial_success'`, `variant: 'warning'` (Amber badge). They are visually and semantically distinct.
2. **`dead_letter`**:
   - `dead_letter` maps strictly to `category: 'needs_attention'`, `variant: 'attention'` (Purple/Indigo Alert badge), distinguishing it from single-attempt failures (`failed:download`).
3. **Exhaustive Mapping Test**:
   - `jobStatus.test.ts` iterates through all 25 `VideoJobStatus` enum values to guarantee zero unmapped backend statuses.

---

## 2. Reusable State Primitives

All page components must consume these standard primitives from `apps/web/src/components/primitives/`:

- **`<LoadingState>`**: Accessible spinner and text status (`role="status"`, `aria-live="polite"`). Supports `sm | md | lg` sizes and full-page layout modes.
- **`<ErrorState>`**: Categorized error container (`role="alert"`).
  - `NETWORK_ERROR` / `SERVER_ERROR`: Renders "Try Again" retry action.
  - `AUTH_RLS_DENIED`: Renders "Re-Authenticate Now" action.
- **`<EmptyState>`**: Standard zero-data layout for empty tables/dashboards with customizable graphic icons and primary call-to-action buttons.

---

## 3. Discriminated Union API Client (`api.ts`)

No component calls `fetch()` or raw `supabase-js` queries directly. All backend interaction is routed through `ExcerptApiClient` ([`apps/web/src/lib/api.ts`](file:///C:/Users/PC/Desktop/Excerpt/apps/web/src/lib/api.ts)).

### Discriminated Union Result
```typescript
type Result<T> = 
  | { success: true; data: T; error?: undefined }
  | { success: false; error: ApiError; data?: undefined };
```

Every API call enforces compile-time checks (`if (res.success) { ... } else { ... }`). Uncaught exceptions are intercepted and categorized into typed errors (`NETWORK_ERROR`, `AUTH_RLS_DENIED`, `SERVER_ERROR`, `UNKNOWN`).

---

## 4. Realtime Subscription Contract (`useRealtimeSync.ts`)

Supabase Realtime subscriptions are wrapped in the `useRealtimeSync` hook ([`apps/web/src/lib/useRealtimeSync.ts`](file:///C:/Users/PC/Desktop/Excerpt/apps/web/src/lib/useRealtimeSync.ts)).

### Lifecycle & Connection Guarantees
1. **Subscribe on Mount**: Channel joins when `jobId` is provided.
2. **Unmount Cleanup**: The `useEffect` cleanup handler explicitly invokes `channel.unsubscribe()` and removes the channel to prevent socket/memory leaks.
3. **Connection Status State**: Exposes `connectionStatus` (`'connecting' | 'connected' | 'reconnecting' | 'disconnected'`) to the UI, preventing silent stale states during network dropouts.
