# BOTTLENECK RANKING

Ranked by total wall-clock time (measured in ms) for a single clip generation job:

1. **Clip Rendering (FFmpeg pass 1 & 2)**: 822,956 ms (71.8%)
   - *Pass 1 (Crop)*: ~461,000 ms
   - *Pass 2 (Caption)*: ~362,000 ms
2. **Nexus Intelligence Module**: 302,250 ms (26.3%)
   - *Learning / V3 Engine Evaluation*: 137,697 ms
   - *Metadata Generation*: 137,328 ms
   - *Hook Rewrite*: 116,328 ms
   - *Thumbnail Selection*: 22,537 ms
3. **Download Video**: 9,615 ms (0.8%)
4. **LLM Segment Generation**: 7,635 ms (0.6%)
5. **Clip Ranking**: 1,467 ms (0.1%)
6. **Upload & Persistence**: ~355 ms (<0.1%)
7. **Transcription**: 193 ms (<0.1%)
8. **Output Validation**: 31 ms (<0.1%)

## Conclusion
FFmpeg accounts for **71.8%** of the total pipeline latency, definitively making it the dominant bottleneck in the system. The Nexus Engine is the secondary bottleneck (26.3%), heavily driven by concurrent LLM tasks (Metadata, Learning Evaluation, and Hook Rewrite).
