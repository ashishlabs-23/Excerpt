---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Data Classification & Retention Policy

This document defines data tiers, privacy requirements, and lifecycle rules for user media and metadata.

---

## 1. Classification Tiers

| Tier | Category | Examples | Storage Location | Retention / Deletion Rules |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Customer Account & Auth** | User IDs, emails, Stripe customer IDs | Supabase Auth / `users` table | Retained until account deletion request (GDPR/CCPA compliant). |
| **Tier 2** | **Customer Media & Clips** | Rendered MP4 clips, ASS subtitle files | Backblaze B2 (`clips/`) | Retained according to user plan quota or explicit user deletion. |
| **Tier 3** | **Ephemeral Pipeline Data** | Uncut raw source videos, intermediate frame buffers | NVMe scratch (`temp/`), B2 source cache | Subject to automatic `RetentionService` sweep (TTL: 24–72 hours). |
| **Tier 4** | **System Telemetry** | Execution latencies, FFmpeg log outputs, stage error codes | Supabase `job_telemetry`, Winston logs | Retained 30 days for operational debugging, then pruned. |

---

## 2. PII Protection Invariants

- User video transcripts and detected facial bounding boxes are treated as customer confidential data.
- Telemetry logs must never print raw video URLs with auth query tokens, user credentials, or plain API keys.
