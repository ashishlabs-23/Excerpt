---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Security Posture

## CI/CD Security Scanners
The pipeline runs the following scanners automatically on every PR and merge to `master`:
- **CodeQL**: SAST scanning for vulnerabilities (SQLi, XSS, etc.)
- **Semgrep**: Custom static analysis rules.
- **Trivy**: Container and filesystem vulnerability scanning.
- **OSV Scanner**: Dependency vulnerability scanning.
- **Gitleaks**: Secrets detection.

## Authentication & Authorization
- **Frontend**: Next.js uses Supabase Auth for user identity.
- **API**: Internal API endpoints require JWT validation (`requireUserJWT` middleware).
- **Database**: PostgreSQL Row Level Security (RLS) is enabled to ensure users can only access their own jobs and clips.

## Secret Management
- Secrets are NEVER committed to the repository.
- Local development uses `.env`, which is ignored via `.gitignore`.
- CI/CD uses GitHub Secrets.
- Production uses Render Environment Variables.

## Boundary Interfaces
- External APIs (AI Providers, B2) are invoked securely over HTTPS.
- Any downloaded external files (e.g., via yt-dlp) are placed in a quarantined `temp/` directory, processed, and immediately removed.
