# VOICEOVER_GENERATION_TRUTH_TEST_V2.md

## Additional Phase A — Database Integrity Audit

Verify voiceover generation does not create inconsistent records.

Checks:

* voiceover_jobs table record created
* status transitions valid
* no duplicate generation_key collisions
* no orphan voiceover records
* no failed → processing illegal transitions

Verify:

* queued
* processing
* generating_audio
* uploading
* completed

Output:

DATABASE_VOICEOVER_REPORT.md

---

## Additional Phase B — Queue Recovery Validation

While voice generation is running:

1. Kill API
2. Kill Worker
3. Kill Render Worker
4. Restart Services

Verify:

* job resumes
* audio generation resumes
* no duplicate audio generated
* no duplicate DB records

Output:

VOICEOVER_QUEUE_RECOVERY.md

---

## Additional Phase C — Docker Version Verification

Before every test:

Execute:

docker compose ps
docker compose images

Verify:

* excerpt-api current build
* excerpt-worker current build
* excerpt-render-worker current build
* excerpt-web current build

Verify latest source files exist inside containers:

* voiceover service
* TTS adapters
* FFmpeg merge service
* storage service

Output:

DOCKER_VERSION_PROOF.md

---

## Additional Phase D — Caption + Voiceover Sync

Generate clip with:

* captions enabled
* voiceover enabled

Verify:

* captions visible
* captions synchronized
* voiceover synchronized
* no overlap issues
* no missing words

Metrics:

Caption Drift
Voice Drift
Combined Sync Score

Output:

VOICEOVER_CAPTION_SYNC_REPORT.md

---

## Additional Phase E — Long Form Stress Test

Generate voiceovers for:

* 30 second clip
* 60 second clip
* 3 minute clip
* 5 minute clip

Verify:

* memory stability
* no truncation
* no corruption
* no FFmpeg crashes

Output:

LONGFORM_VOICEOVER_REPORT.md

---

## Final Production Gate

Voiceover feature is production ready only if:

Voice Success Rate > 95%

Upload Success Rate > 99%

Database Consistency = 100%

Queue Recovery = PASS

Storage Integrity = PASS

Caption Sync Score > 90

Voice Sync Score > 90

Docker Version Verification = PASS

Zombie Jobs = 0

Orphan Audio Records = 0

Duplicate Voiceovers = 0

Outputs:

VOICEOVER_BASELINE.md

VOICEOVER_TRUTH_REPORT.md

VOICEOVER_PRODUCTION_CERTIFICATE.md
