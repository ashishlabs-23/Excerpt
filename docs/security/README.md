---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Security Architecture & Governance

This directory contains the authoritative security baselines, threat models, access controls, and operational incident policies for Excerpt.

---

## 🔒 Security Specifications

| Document | Focus | Scope |
| :--- | :--- | :--- |
| [`SECURITY_ARCHITECTURE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/SECURITY_ARCHITECTURE.md) | Network & Isolation Boundaries | SSRF guards, container boundaries, protected backends |
| [`THREAT_MODEL.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/THREAT_MODEL.md) | STRIDE Threat Assessment | Attack surfaces across FFmpeg, video ingestion, and workers |
| [`DATA_CLASSIFICATION.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/DATA_CLASSIFICATION.md) | Data Privacy & Retention Tiers | User account data, video transcripts, ephemeral files |
| [`SECRETS_MANAGEMENT.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/SECRETS_MANAGEMENT.md) | Secrets Handling Procedures | Environment injection, rotation, zero-secrets policy |
| [`ACCESS_CONTROL.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/ACCESS_CONTROL.md) | Auth & Authorization | Supabase RLS, JWT tokens, presigned S3 URLs |
| [`INCIDENT_RESPONSE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/INCIDENT_RESPONSE.md) | Incident Response Runbook | Severity triage, containment, and forensic post-mortems |

---

> [!NOTE]
> Public vulnerability reporting instructions and supported versions are located at repository root in [`SECURITY.md`](file:///c:/Projects/Ashishlabs/Excerpt/SECURITY.md).
