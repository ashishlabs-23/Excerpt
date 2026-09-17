---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Security Architecture

This document specifies the network boundaries, process isolation controls, and verification models implemented across the Excerpt platform.

---

## 1. Security Boundaries

```text
[ Untrusted External Web / YouTube / User Uploads ]
                        │
                        ▼ Ingress Validation
┌───────────────────────────────────────────────────────────┐
│                      DMZ / INGRESS                        │
│  - SSRF Guard: Denies loopback (127.0.0.1, ::1),          │
│    cloud metadata (169.254.169.254), private RFC1918 IPs  │
│  - Content-Type verification & magic byte validation      │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼
┌───────────────────────────────────────────────────────────┐
│                     ISOLATED RUNTIME                      │
│  - Child process execution with restricted privileges     │
│  - Read-only scratch filesystem where applicable          │
│  - Strict memory and CPU resource quotas                  │
└─────────────────────────────┬─────────────────────────────┘
                              │
                              ▼ Authenticated Egress
┌───────────────────────────────────────────────────────────┐
│                    PROTECTED BACKENDS                     │
│  - Supabase PostgreSQL (Row-Level Security & Service Role)│
│  - Backblaze B2 (Private buckets, presigned URLs only)    │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Ingress & SSRF Defenses

Video ingestion routes accept external URLs. To prevent Server-Side Request Forgery (SSRF):
- All destination hostnames are resolved to IP addresses before initiating HTTP requests.
- Private IPv4 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`) and IPv6 loopback (`::1`) are blocked immediately.
- Redirects are re-validated against the SSRF filter before fetching media chunks.
