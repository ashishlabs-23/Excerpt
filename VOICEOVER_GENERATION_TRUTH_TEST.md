# VOICEOVER_GENERATION_TRUTH_TEST.md

## Objective

Prove that the Excerpt Voiceover Studio works end-to-end in the current Dockerized production architecture without data loss, failed uploads, broken audio, or desynchronization.

---

# Phase 0 — Docker Build Verification

## Verify Current Build

Execute:

```bash
docker compose ps
docker compose images
```

Verify:

* excerpt-api running
* excerpt-worker running
* excerpt-render-worker running
* excerpt-web running

Verify image timestamps match latest source code.

Output:

```text
DOCKER_BUILD_REPORT.md
```

---

# Phase 1 — Voiceover Service Validation

## Google TTS

Generate a voiceover from sample text.

Verify:

* API reachable
* audio generated
* duration > 0
* valid audio format

Output:

```text
GOOGLE_TTS_REPORT.md
```

---

## ElevenLabs

Generate identical script.

Verify:

* API call succeeds
* credits available
* MP3 generated
* voice metadata returned

Output:

```text
ELEVENLABS_REPORT.md
```

---

# Phase 2 — Storage Validation

Verify generated audio is persisted.

Checks:

* storage path exists
* object physically exists
* signed URL generated
* signed URL downloads correctly

Output:

```text
VOICE_STORAGE_REPORT.md
```

---

# Phase 3 — Clip Merge Validation

Attach generated voiceover to a rendered clip.

Verify:

* FFmpeg merge succeeds
* output MP4 exists
* output contains video stream
* output contains audio stream

Execute:

```bash
ffprobe final_clip.mp4
```

Verify:

```text
Video Stream = Present
Audio Stream = Present
```

Output:

```text
VOICE_MERGE_REPORT.md
```

---

# Phase 4 — Synchronization Validation

Audit:

* voice starts correctly
* voice ends correctly
* no drift
* no clipping
* no silence gaps

Metrics:

* sync offset
* average drift
* max drift

Output:

```text
VOICE_SYNC_REPORT.md
```

---

# Phase 5 — Browser Subagent Audit

Launch Browser QA Agent.

Navigate:

* Dashboard
* Gallery
* Clip Editor
* Voiceover Studio

Verify:

* generate button works
* playback works
* download works
* waveform renders
* no console errors
* no failed network requests

Output:

```text
VOICEOVER_BROWSER_AUDIT.md
```

---

# Phase 6 — Reliability Stress Test

Generate 10 voiceovers sequentially.

Verify:

* success rate
* latency
* upload integrity
* storage integrity

Metrics:

```text
Success Rate
Average Generation Time
P95 Latency
Upload Failures
Storage Failures
```

Output:

```text
VOICEOVER_STRESS_TEST.md
```

---

# Phase 7 — Crash Recovery Test

While generating voiceovers:

1. Kill API
2. Restart API
3. Kill Worker
4. Restart Worker
5. Kill Render Worker
6. Restart Render Worker

Verify:

* no lost jobs
* no orphan audio files
* no zombie voiceover jobs

Output:

```text
VOICEOVER_RECOVERY_REPORT.md
```

---

# Phase 8 — Final Verdict

Production Requirements:

* Voice Generation Success > 95%
* Upload Success > 99%
* Audio Corruption = 0
* Sync Errors < 100ms
* Zombie Jobs = 0
* Orphan Audio Files = 0

Outputs:

```text
VOICEOVER_BASELINE.md
VOICEOVER_TRUTH_REPORT.md
```

---

## Docker Rule

Any modification to:

* Voiceover Studio
* TTS Providers
* FFmpeg Merge Logic
* Storage Upload Logic
* Worker Logic
* Render Worker Logic

MUST be followed by:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

Then rerun:

```bash
VOICEOVER_GENERATION_TRUTH_TEST.md
```

No voiceover feature is considered complete until it passes all phases above on the Docker deployment.
