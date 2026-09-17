---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# ADR-003: Content-Addressed Sources & Artifacts

## Status
**ACCEPTED** (2026-08-25)

## Context
Video clipping generates multiple intermediate and final assets: raw source videos, audio extractions, transcripts, ASS subtitle files, and rendered MP4 clips. Duplicate downloads of the same source video waste bandwidth, disk space, and processing time. Furthermore, caching must be idempotent and tamper-proof.

## Decision
All persistent assets and cached source videos are stored using cryptographic content-addressing (`sha256/<hash>.<ext>`).

Storage keys in Backblaze B2 and local cache paths are derived directly from the computed SHA256 checksum of the file bytes.

## Alternatives Considered
- UUID-based paths: Susceptible to duplicate uploads and redownloads of identical source files.
- URL-encoded paths: Fails when video URLs change query params or CDN tokens while video content remains identical.

## Consequences
- **Positive**: Complete deduplication across users, zero-risk cache pollution, immutable storage objects.
- **Negative**: Requires computing SHA256 during ingestion stream before assigning canonical storage keys.
