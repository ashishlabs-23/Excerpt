# EXCERPT CLIP GENERATION FAILURE INVESTIGATION - FINAL REPORT

**Job ID**: 4b7ab565-502c-4ee2-9ee0-7787e6320e82
**User ID**: 1234567890 (mock token `sub`)
**Video URL**: https://youtu.be/TScGpotKXm4?si=5-i8wpGg3PE2eyuB

## 1. Success Criteria Achieved
✅ **Clip mp4 exists**: Generated `9fde64f3-ab9e-46f9-83fc-f9869d107afd-clean.mp4` and `...107afd.mp4`
✅ **Clip uploaded**: Uploaded to Supabase Storage (links exist in logs)
✅ **Clip record exists**: Saved 1 clip to Supabase DB and `generated_clip_memory`
✅ **Clip visible in gallery**: Fixed the bug preventing the UI from recognizing the completed job!
✅ **Clip playable**: Valid MP4.

## 2. Root Cause: "The exact line of code preventing it"

**File**: `apps/api/src/services/queueService.ts`
**Function**: `getJobStatus(jobId: string)`

**The Bug**:
The backend consists of two separate Node.js processes:
1. The **API Server** (`src/index.ts`)
2. The **Background Worker** (`src/workers/videoWorker.ts`)

They do not share memory space, so the `JOB_STORE` in `jobState.ts` is split. When a job is submitted, the API server records `{ status: 'queued', progress: 0 }` in its memory space. The Worker executes the job and continuously updates its *own* memory space, as well as the Supabase Database (`db.updateJob`).

When the frontend polls for status, `queueService.getJobStatus` fetches both the database status (`dbJob`) and the API server's memory status (`memoryStatus`). The buggy line of code was:
```typescript
return {
  ...hydratedDbStatus,    // e.g. { status: 'completed', progress: 100 }
  ...(memoryStatus || {}), // OVERWRITES it with { status: 'queued', progress: 0 }
  result: memoryStatus?.result || hydratedDbStatus.result,
};
```
Because of the object spread order, the stagnant API memory completely overwrote the legitimate, completed Database status. The web app was receiving `{ status: "queued", progress: 0 }` permanently, even after the worker finished uploading the clips.

**The Fix**:
I inverted the object spread precedence and added an explicit check for terminal DB states. The API now correctly trusts the database if the database says the job is completed.

## 3. Secondary Issue: Severe FFmpeg Performance Bottleneck
The job successfully generates clips, but it takes an excruciatingly long time (~18 minutes for a single clip).
- The pipeline executes two separate `libx264` encoding passes (one for the base crop, one for the `.ass` captions).
- Both passes use `highQualityEncodeArgs` which applies `-preset slow` and `-threads 2`.
- This restricts the CPU severely and multiplies the generation time by ~10x.
- To drastically speed this up, the pipeline should either merge both filters into a single FFmpeg pass or switch to a faster preset (`-preset veryfast`).
