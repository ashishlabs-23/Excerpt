---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Threat Model (STRIDE)

This document analyzes security threats across Excerpt's processing pipeline using the STRIDE methodology.

---

## 1. Threat Matrix

| Threat Category | Target | Vector | Implemented & Planned Mitigations | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | API Requests | Forged authentication tokens | Supabase JWT verification on all protected endpoints. | **Verified** |
| **Tampering** | Stored Media | Modifying video files in transit/cache | Content-addressing via SHA256 checksums verified before execution. | **Verified** |
| **Repudiation** | Job & Billing Events | Denying clip generation requests | Immutable job telemetry logs written to database on state change. | **Verified** |
| **Information Disclosure** | B2 Storage / Database | Unauthorized access to user videos | Private B2 buckets; time-bounded presigned URLs ($\le 1\text{ h}$); Supabase RLS. | **Verified** |
| **Denial of Service** | Media Workers | Zip bombs, malformed video containers, infinite loops | Bounded stage timeouts (15s probe, 5m transcode); SIGKILL watchdogs; max file limits. | **Verified** |
| **Elevation of Privilege** | Node / Container Host | FFmpeg buffer overflow exploit | Container runs as non-root user; ephemeral scratch disks; isolated containers. | **Planned / Verified in Prod** |

---

## 2. High-Risk Attack Surfaces

1. **Video Parsing (FFmpeg / ffprobe)**:
   - Untrusted binary inputs parsed by native C/C++ libraries.
   - Mitigation: Container memory limits, explicit timeout kills, updated FFmpeg patches.
2. **URL Fetching (yt-dlp)**:
   - Untrusted web resources and redirects.
   - Mitigation: SSRF host/IP filtering, sandbox subprocess execution.
