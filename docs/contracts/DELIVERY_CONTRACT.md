# DELIVERY CONTRACT
# Excerpt — Artifact Delivery and Playback Validation (Step 12)

> **Status**: COMPLETE
> The final tier of the Excerpt pipeline is deployed. It executes rigorous physical validation on uploaded MP4s and resolves the ultimate parent job status using a strict Partial Delivery Policy.

## 1. Network & Playback Validation

We do not trust that FFmpeg exiting with code 0 means the file is a playable MP4 on the internet.
The `PlaybackValidator` verifies the remote URL explicitly:
- **HTTP HEAD & 206 Partial Content**: It simulates HTTP requests to ensure the storage bucket natively supports byte-range requests (required for web video scrubbing).
- **MP4 `ftyp` Header**: It verifies the binary stream explicitly contains the `ftyp` atom. Corrupt files without headers are instantly flagged as failed.
- **Audio Integrity**: If the database artifact claims `hasAudio=true`, the validator verifies an active audio track exists in the muxed container.

## 2. Upload Integrity Checksum

Transport corruption (silent bit flips during upload to S3) is a real production failure mode.
The `UploadIntegrity` engine combats this by streaming a local `md5` hash of the rendered MP4 file, and cross-referencing it directly against the remote ETag returned by the storage provider. Any mismatch throws a `PipelineError`, immediately rejecting the corrupted clip.

## 3. Strict Partial Delivery Policy

When `N` total clips are planned, and `M` successfully pass the aggressive playback and integrity validations:
- **`M == 0`**: The entire job is strictly marked `failed:artifact_unusable`. 
- **`0 < M < N`**: The parent job is explicitly marked `completed:partial`. This is an entirely distinct status from `completed`. It guarantees frontend clients and webhook subscribers immediately know some artifacts were dropped, without needing to manually count arrays. The `M` surviving artifacts are safely retained and exposed.
- **`M == N`**: The job is marked `completed`. 

## 4. Test Verification

5 explicit edge-cases in `delivery.test.ts` continuously assert the engine:
1. **Total Failure**: Sent N=2 clips, both corrupted. Asserted the parent status locked to `failed:artifact_unusable`.
2. **Partial Success**: Sent N=2 clips. Passed 1, failed 1. Asserted the parent status locked to `completed:partial` and strictly retained the 1 valid artifact.
3. **Total Success**: Sent N=2, passed 2. Asserted the parent status locked to `completed`.
4. **Transport Corruption**: Mocked an ETag mismatch. Asserted the `UploadIntegrity` guard triggered the failure.
5. **Playback Failure**: Mocked a missing `ftyp` header. Asserted the `PlaybackValidator` triggered the artifact rejection.
