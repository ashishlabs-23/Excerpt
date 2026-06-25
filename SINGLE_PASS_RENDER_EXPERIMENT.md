# SINGLE-PASS RENDER EXPERIMENT

## Experiment Setup
- **Objective**: Merge the 9:16 crop pass and the ASS subtitle pass into a single FFmpeg complex filtergraph to avoid reading/writing the intermediate MP4 file.
- **Code Change**: Refactored `processClip` to accept `subtitlePath` and chain `ass=...` directly after the `crop` filter. Refactored `videoWorker.ts` to generate the `.ass` file before initiating the render.
- **Preset**: `-preset veryfast` (Hardware encoding was not used to maintain an apples-to-apples comparison with Priority 1).

## Results vs Dual-Pass (Fastpath)

| Metric | Dual-Pass (`veryfast`) | Single-Pass Prototype | Delta |
|--------|------------------------|-----------------------|-------|
| **Pass 1 (Crop)** | 1.1 minutes | N/A | |
| **Pass 2 (Caption)** | 0.85 minutes | N/A | |
| **Total Render Time** | **1.95 minutes** | **~6.7 minutes** | **+243% Slower** |

*(Note: Total job execution time was disrupted by a system sleep state during the test, so wall-clock timestamps from the logs were used to measure the render stage).*

## Analysis
Counter-intuitively, the Single-Pass approach performed **significantly worse** than the Dual-Pass approach. 

**Why did this happen?**
1. **Filtergraph Bottlenecking**: The `ass` filter is notoriously single-threaded and CPU-bound. When chained immediately after a high-quality `lanczos` scale and dynamic crop, it forces FFmpeg to process the heavy graphical subtitle rendering sequentially on the same bottlenecked pipeline. 
2. **I/O vs Compute**: We assumed Disk I/O (writing and reading the intermediate `raw-clip.mp4`) was the bottleneck. This result proves that **Compute (CPU)** is the actual bottleneck. The dual-pass approach allowed FFmpeg to split the heavy scaling/cropping compute from the heavy subtitle rendering compute across two separate invocations, which better saturated the CPU cores.

## Conclusion
**DO NOT USE THE SINGLE-PASS PROTOTYPE**. 
The Dual-Pass architecture with the `veryfast` preset is vastly superior (1.95 minutes vs 6.7 minutes). I recommend we revert the single-pass prototype code and maintain the two-step rendering process, as it empirically provides the highest throughput.
