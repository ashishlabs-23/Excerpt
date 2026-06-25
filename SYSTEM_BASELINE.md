# System Baseline (E0)

## Overview
- **Job ID**: 8ed45fc7-6835-416a-89b4-328d73875386
- **Video**: https://youtu.be/yO6POoef5cc?si=0gNRJJ1pRK3j807X
- **Status**: ORPHANED (Stuck in `detecting_clips`)
- **Clips Generated?**: Y (2 clips generated)
- **Gallery Visible?**: N (State transition failed before completion)
- **Video Playable?**: Y (Clips uploaded to Supabase Storage successfully)

## Runtime Metrics
*Note: Due to the state machine crash, exact stage boundaries were derived from the `worker_v8.log` traces.*
- **Average Download/Transcript Time**: ~30-40 seconds
- **Average Analysis Time**: ~140 seconds (Gemini API 429 Error caused a 30s delay, followed by Llama-3.3 processing)
- **Average Render Time**: ~102 seconds (101821ms reported by `clip_1_render`)
- **Average Total Time**: ~5.5 minutes until crash

## Reliability
- **Success Rate**: 0%
- **Failure Rate**: 100% (Fatal exception during pipeline termination)
- **State Machine Integrity**: **FAILED**. The worker successfully rendered and uploaded the clips, but the final `updateJob` call failed because the `jobs` table is missing the `debug_data` column. Because of this, the database rolled back the transaction, leaving the job permanently stuck in `detecting_clips (50%)` and invisible to the client.

## Cache
- **L1/L2/L3 Hit Rate**: 0% (Cold run)
- **L4/L5 Cache**: Populated. The analysis cache was successfully written for hash `cb67ceeb1497dafb769a91928b906671b9707cbc8957b40d3c7502bf699b3447`.

## Quality
- **Boundary Accuracy**: TBD
- **Story Completeness**: TBD
- **Missing Buildup %**: TBD
- **Reaction Cutoff %**: TBD
- **Replay Missing %**: TBD
- **Wrong Story %**: TBD

---

### Evidence Discovery: The Missing Column Bug

The pipeline ran all the way through FFmpeg rendering and Supabase Storage upload, but crashed with the following error:
```
[Worker]: AA?' Job 8ed45fc7-6835-416a-89b4-328d73875386 FAILED: Could not find the 'debug_data' column of 'jobs' in the schema cache
```
This confirms that the state machine is extremely fragile. An error in saving diagnostic information crashes the entire job and orphans it, meaning the user never receives their clips even though the heavy compute (FFmpeg) succeeded.

**Before we proceed to E1, this must be fixed.**
