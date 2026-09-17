---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Secrets Management Policy

This document defines how secrets, credentials, and API keys are stored, rotated, and protected across Excerpt environments.

> [!CAUTION]
> **NO SECRETS IN CODE OR DOCUMENTATION**  
> Under no circumstances may production credentials, API keys, private tokens, service account JSON, or database passwords be committed to git or stored in documentation.

---

## 1. Secrets Inventory & Storage

| Secret Name | Purpose | Production Storage | Local Development |
| :--- | :--- | :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Database admin access & worker operations | Render Secret Environment Variable | `.env.local` (git-ignored) |
| `SUPABASE_JWT_SECRET` | Auth verification | Render Secret Environment Variable | `.env.local` (git-ignored) |
| `B2_APPLICATION_KEY_ID` / `KEY` | Backblaze B2 S3 API access | Render Secret Environment Variable | `.env.local` (git-ignored) |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | LLM perception & transcription | Render Secret Environment Variable | `.env.local` (git-ignored) |
| `STRIPE_SECRET_KEY` / `WEBHOOK_SECRET` | Billing webhook verification | Render Secret Environment Variable | `.env.local` (git-ignored) |

---

## 2. Secrets Handling Invariants

1. **Environment Variables Only**: All runtime secrets must be injected strictly via environment variables at container startup.
2. **Never Log Secrets**: Structured loggers (`Winston`, console interceptors) sanitize known secret patterns and authorization headers (`Bearer *`) before emitting JSON logs.
3. **Secret Scanning**: GitHub push protection and CI secret scanning (via GitGuardian/Trufflehog) are enforced to detect accidental credential leaks before merge.

---

## 3. Secret Rotation Procedures

- **Routine Rotation**: B2 application keys and external AI keys rotated quarterly.
- **Compromised Credential Procedure**:
  1. Revoke the compromised key immediately via the provider console.
  2. Issue a replacement key and update Render secret environment settings.
  3. Trigger zero-downtime rolling restart of all API and worker instances.
  4. File an incident report under [`docs/security/INCIDENT_RESPONSE.md`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/INCIDENT_RESPONSE.md).
