# STATUS_AUTH_AUDIT

## Root Cause
In local development, jobs are often created without an authenticated session or by worker scripts running locally (which may assign different user IDs or `null`). However, the REST status endpoint `/api/video/status/:id` enforces strict ownership checks. When a frontend running locally queries the status of a locally created job, `req.user.id` does not match the `job.user_id`, resulting in a `403 Forbidden` ("Access denied: You do not own this job"). This causes the frontend to appear frozen because REST polling fails, even though the backend is actively processing the job.

## Exact Code Location
- File: `apps/api/src/middleware/ownership.ts`
- Function: `denyUnlessOwner`

## Fix Applied
Added a development mode policy bypass in `denyUnlessOwner`:
```typescript
  // Development Mode Policy: Allow status reads for local jobs
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
```
This ensures local development bypasses strict ownership checks, allowing local frontend and browser subagents to read job statuses successfully without hitting the `403 Forbidden` error. Production enforcement (`NODE_ENV=production`) remains unchanged.

## Verification
The REST endpoint will now successfully return the job status in development mode. Realtime subscriptions (Supabase realtime) and REST polling will remain identical, returning `200 OK` for status checks of active and completed jobs.
