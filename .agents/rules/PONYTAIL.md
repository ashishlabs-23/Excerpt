# Ponytail: Lazy Senior Dev Standard for Excerpt

> "The best code is the code you never wrote. Boring over clever. Deletion over addition. Shortest working diff wins."

## The Excerpt 7-Rung Decision Ladder

Before writing any new service, script, or filter in Excerpt, stop at the first rung that holds:

1. **Does this need to be built at all? (YAGNI)**
   - 90% of viral clip retention comes from:
     1. Stable eye-level framing (no wobbling)
     2. Fast, readable word-by-word captions
     3. Crisp cuts on topic/speaker transitions
   - Do NOT build speculative micro-models, complex orchestration layers, or redundant audit harnesses unless an explicit bug or metric demands it.

2. **Does it already exist in Excerpt?**
   - Check existing services before adding new ones:
     - Video manipulation: `apps/api/src/services/videoProcessor.ts`
     - Crop planning: `apps/api/scripts/unified_crop_planner.py`
     - Speech & words: `WhisperService.ts`
     - Transcoding / Filters: `FFmpegDirectPipeline.ts`
   - NEVER create a parallel duplicate engine (e.g. `reframe_engine_v2.py`). Upgrade or fix the canonical engine.

3. **Does FFmpeg / Native Language Stdlib already do this?**
   - Use FFmpeg's native expression evaluator for easing, clamping, and math (`smoothstep`, `if`, `between`, `min`, `max`, `pow`).
   - Do NOT pipe 10,000 frame-by-frame coordinate points from Python to Node when FFmpeg can interpolate piecewise keyframes natively.
   - Combine operations (`crop`, `scale`, `ass` captions, `setsar`) into a single-pass filtergraph instead of writing intermediate temporary files.

4. **Does the OS / Platform feature cover it?**
   - Stream directly through FFmpeg pipes (`pipe:0` / `pipe:1`) or S3/B2 presigned uploads instead of buffering large multi-gigabyte `.mp4` chunks on local disk.

5. **Does an already-installed dependency solve it?**
   - We already have `mediapipe`, `opencv-python`, `fluent-ffmpeg`, and `@prisma/client`.
   - Do NOT pull in heavy 2GB deep learning checkpoints when MediaPipe face mesh + mouth aspect ratio (MAR) achieves 95%+ active speaker accuracy on standard CPU.

6. **Can this be one line or a closed-form formula?**
   - Smooth camera pan easing:
     `x = x0 + (x1 - x0) * (3*pow(norm_t, 2) - 2*pow(norm_t, 3))`
   - Dead-zone stabilization:
     `if (Math.abs(newX - lastX) < 0.025) return lastX;`
   - Golden Eye-Line anchoring:
     `idealY = Math.round(speakerY * scaledHeight - 0.35 * cropHeight);`

7. **Only then: write the minimum code that works.**
   - Root-cause fixes only: fix the shared function, not just the single caller.
   - Minimal diffs: the smallest surgical change in the right place beats a 500-line rewrite.
   - Validation, error handling, clean process exits, and security are NEVER cut.
