---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Storage Architecture

This document defines the storage hierarchy, object layout, content addressing, and retention mechanisms.

---

## 1. Storage Tiers

Excerpt utilizes a three-tier storage model:

```text
Tier 1: Ephemeral Local NVMe (apps/api/temp/)
  └── Active frame buffers, raw FFmpeg intermediate chunks, ASS scripts.
      Lifespan: Single job run. Flushed on job completion/failure.

Tier 2: Local Source Disk Cache (apps/api/cache/)
  └── Shared source videos keyed by sha256.
      Lifespan: LRU eviction bounded by disk quota (default 50 GB).

Tier 3: Cloud Object Store (Backblaze B2 S3-Compatible API)
  └── Source video archives and finalized rendered clips.
      Lifespan: Controlled by RetentionService policies.
```

---

## 2. Object Store Layout

Objects in Backblaze B2 follow strict cryptographic key paths:

```text
b2://excerpt-media-bucket/
├── sources/
│   └── sha256/{sourceHash}.mp4
├── clips/
│   └── {jobId}/
│       ├── {clipId}.mp4
│       ├── {clipId}.ass
│       └── metadata.json
└── thumbnails/
    └── {jobId}/
        └── {clipId}.jpg
```

---

## 3. Invariants & Retention Enforcement

1. **Content Address Deduplication**: Sources are stored by SHA256 hash. If multiple users submit the same source URL, only one copy is downloaded and stored in B2.
2. **Frozen Retention Engine**: Object cleanup is strictly managed by `RetentionService` ([`docs/operations/RETENTION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/RETENTION.md)).
3. **Signed Access Only**: Direct public read access to B2 buckets is disabled. All video delivery utilizes time-limited presigned S3 URLs ($\le 3600\text{ s}$).
