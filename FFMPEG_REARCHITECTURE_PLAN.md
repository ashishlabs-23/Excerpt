# FFMPEG REARCHITECTURE PLAN

## Current State
- FFmpeg currently consumes **71.8%** of the total end-to-end pipeline latency.
- It executes two entirely isolated full-re-encode passes (`libx264`, `-preset slow`, CPU-bound):
  1. Base cinematic crop encode
  2. Subtitle overlay encode

## Proposed Optimization Vectors

### 1. Single-Pass Encoding Graph (Highest ROI)
- **Concept**: Merge the `crop` filter and the `subtitles` filter into a single complex filtergraph (`-filter_complex "[0:v]crop=...[cropped];[cropped]subtitles=...[out]"`).
- **Latency Reduction**: ~50% immediate reduction of FFmpeg time (eliminates the second pass).
- **Engineering Effort**: Medium (requires refactoring `videoProcessor.ts` pipeline orchestration and moving subtitle generation before crop rendering).
- **Risk**: Low (purely a graph optimization, no external dependencies).

### 2. Fast-Path Preset Tuning
- **Concept**: Shift from `-preset slow` to `-preset veryfast`.
- **Latency Reduction**: Additional ~60-80% reduction.
- **Engineering Effort**: Trivial (1 line of code).
- **Risk**: Low (slight bitrate/quality trade-off, perfectly acceptable for social media drafts).

### 3. Hardware Acceleration (NVENC / QSV / AMF)
- **Concept**: Offload encoding from `libx264` (CPU) to `h264_nvenc` or `hevc_nvenc` (GPU).
- **Latency Reduction**: ~80-90% reduction on top of single-pass graph.
- **Engineering Effort**: High (requires cloud GPU instances or specialized local hardware, updating Docker/deployment dependencies).
- **Risk**: High (hardware dependency, scaling complexity).

### 4. Parallel Clip Rendering
- **Concept**: Render multiple clips from the same job simultaneously rather than sequentially.
- **Latency Reduction**: Divides rendering time by `num_clips` (assuming sufficient hardware threads).
- **Engineering Effort**: Medium.
- **Risk**: Medium (potential memory/CPU exhaustion if not carefully concurrency-limited).

## Recommendation
1. Implement **Single-Pass Encoding** combined with **`-preset veryfast`** immediately. This will likely reduce the 14-minute render time down to ~1-2 minutes without requiring new infrastructure.
2. Evaluate Hardware Encoding (NVENC) only if the above software optimizations do not meet the latency targets.
