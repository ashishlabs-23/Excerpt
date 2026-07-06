---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Deployment Architecture

Excerpt utilizes a modern, verified CI/CD pipeline built on GitHub Actions and Render. 

## Flow

```mermaid
graph TD
    A[Commit / Push] --> B[GitHub Actions: build.yml]
    B -->|Tests Pass| C[GitHub Actions: security.yml]
    C -->|Scans Pass| D[Render Deployment Hook]
    D --> E[Production Startup]
    E -->|workflow_dispatch| F[deploy-verification.yml]
    F -->|Poll /health| G{Match Commit?}
    G -->|Yes| H[Smoke Tests]
    G -->|No / Timeout| I[Mark Failed]
    H --> J[Self-Test]
    J -->|Success| K[Slack/Discord Notify]
```

## Release Discipline
We use Semantic Versioning (SemVer) for production releases:
- `vX.Y.Z` (e.g., `v2.3.0`)
- **X (Major)**: Breaking API changes, major architectural shifts.
- **Y (Minor)**: New features, non-breaking schema additions.
- **Z (Patch)**: Security fixes, bug fixes, emergency patches.

Always tag releases in GitHub. The release tag automatically flows into the Dashboard Metadata.
