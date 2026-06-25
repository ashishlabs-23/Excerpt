# LATENCY PROFILE

## Profile Scope
**Job ID**: 4b7ab565-502c-4ee2-9ee0-7787e6320e82
**Video Source**: YouTube (5-minute video)
**Total Execution Time**: 1,145,559 ms (19.09 minutes)
**Environment**: Local (CPU Encoding, Ollama Fallback)

## Measured Wall-Clock Latency Breakdown

1. **Download (`stage_0_input`)**: 9,615 ms (9.6s)
2. **Transcription (`stage_1_transcript`)**: 193 ms (0.19s) - *Likely cached*
3. **LLM Analysis / Candidate Generation (`stage_3_segment_generation`)**: 7,635 ms (7.6s)
4. **Nexus Intelligence Modules (`stage_2_to_12_nexus_modules`)**: 302,250 ms (5.03 minutes)
   - *Sub-stages within Nexus*:
     - Thumbnail Selection (`stage_7_thumbnail`): 22,537 ms (22.5s)
     - Hook Rewrite (`stage_8_hook_rewrite`): 116,328 ms (1.93 mins)
     - Metadata (`stage_9_metadata`): 137,328 ms (2.28 mins)
     - Learning Evaluation (`stage_12_learning`): 137,697 ms (2.29 mins)
     - Cinematic Crop Plan (`stage_5b_cinematic_crop`): 647 ms (0.64s)
     - Quality Guard (`stage_10_quality_guard`): 0 ms
5. **Ranking (`stage_6_ranking`)**: 1,467 ms (1.46s)
6. **Render & Caption Pipeline (`clip_1_render` within `stage_11`)**: 822,956 ms (13.71 minutes)
   - *Render Sub-stages*:
     - Crop Render pass: ~461,000 ms (7.68 minutes)
     - Caption Render pass: ~362,000 ms (6.03 minutes)
7. **Persistence / Upload**: Included in `stage_11` wrapper along with rendering (~350 ms).
8. **Output Validation (`stage_13_output_validation`)**: 31 ms (0.03s)

## Observation
FFmpeg rendering currently accounts for **71.8%** of the total pipeline duration. AI / Nexus analysis accounts for **26.3%**. All other stages combined account for less than **2%**.
