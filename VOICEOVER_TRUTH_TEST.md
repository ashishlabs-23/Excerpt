# Voiceover V2 - Mandatory Truth Test Suite

All tests must be executed and verified before pushing to production.

## Test Matrix

### Test 1: Custom Script (Direct Entry)
- **Action:** Input user script -> Select Voice -> Synthesize.
- **Verification:** Custom script is directly converted to TTS and merged.
- **Status:** PASS ✅

### Test 2: AI Generated Script
- **Action:** Select AI Generated Script source -> Choose style -> Select Language -> Generate -> Edit -> Synthesize.
- **Verification:** ScriptGenerationService successfully calls LLM, generates style-appropriate script, translates to selected language, and processes.
- **Status:** PASS ✅

### Test 3: Transcript Script
- **Action:** Select Transcript Script source -> Synthesize.
- **Verification:** Raw transcript text is processed into TTS directly.
- **Status:** PASS ✅

### Test 4: Google TTS Provider
- **Action:** Select Google TTS -> Synthesize.
- **Verification:** Audio generated successfully using Neural2 voice names.
- **Status:** PASS ✅

### Test 5: ElevenLabs Provider
- **Action:** Select ElevenLabs -> Synthesize.
- **Verification:** Premium ElevenLabs audio generated successfully.
- **Status:** PASS ✅

### Test 6: Storage & Asset Validation
- **Action:** Perform asset validation checks post-upload.
- **Verification:** 
  - Audio file exists on B2 storage.
  - Video file exists on B2 storage.
  - Signed URL is fetchable (HTTP 200).
  - FFprobe verification confirms valid H.264/AAC output containers with `-movflags +faststart`.
- **Status:** PASS ✅

### Test 7: Pipeline Isolation Stress Test
- **Action:** Run 10 football clip generations + 5 voiceover generations simultaneously.
- **Verification:**
  - Clip Generation Success > 95% (Heuristic / AI / Recovery modes)
  - Voiceover Generation Success > 95%
  - Zombie Jobs / Lockups = 0
  - Data Loss = 0
- **Status:** PASS ✅
