# CANDIDATE FAILURE REPORT

**Candidate Clip Selected**: Yes
**Count**: 1
**Clip Reason**: "V1 transcript heuristic fallback active. Generated 1 transcript-guided clip plans."

## Root Cause Analysis

1. **AI Detachment**: Ollama local generation aborted 3 times. The system fell back to a heuristic transcript-based method.
2. **Double Encoding**: The video pipeline executes two full `libx264` encoding passes:
   - Pass 1: Cropping (`raw-clip-...mp4`). This took ~8 minutes.
   - Pass 2: Captioning (`clip-...mp4`). This is currently taking > 5 minutes.
3. **Severe FFmpeg Bottleneck**: Both encoding passes use `-preset slow` and `-threads 2` on CPU, which takes > 15 minutes for a single clip.
4. **Result**: The clip generation does not explicitly "fail", but it hangs/takes so long that it essentially times out from the user's perspective, or the local environment kills it before completion. The files are not uploaded until this multi-stage CPU bottleneck clears.
