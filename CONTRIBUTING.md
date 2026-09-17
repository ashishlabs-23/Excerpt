# Contributing to Excerpt

Thank you for contributing to Excerpt! This guide explains our development workflow, engineering standards, and documentation invariants.

---

## 1. Monorepo Organization

- **`packages/clipping-core`**: Pure deterministic video extraction, framing geometry, and kinetic subtitle generation. Zero I/O, zero network, pure unit tests.
- **`apps/api`**: Express backend, background video/render workers, database migrations, and storage integrations.
- **`apps/web`**: Next.js 14 frontend studio, real-time SSE progress updates, and video playback reviews.
- **`benchmarks`**: Fixed test corpora, runners, and raw measurement output reports.
- **`docs`**: Canonical system of record for architecture, contracts, security, operations, testing, and research.

---

## 2. Documentation Governance

All contributions modifying system behavior must adhere to the **Authoritative Documentation Rule**:
- Every document in `docs/` must have status frontmatter (`status: current | draft | ...`).
- Pure technical interfaces belong in TypeScript types. Markdown documents in `docs/contracts/` must explain non-obvious domain invariants, boundary guarantees, and failure modes.
- Never commit credentials, tokens, or API keys anywhere in code or documentation.

---

## 3. Development & Verification Workflow

```bash
# Install dependencies
npm install

# Run pure unit tests
npm run test:core

# Run API & subsystem tests
npm run test:api

# Run P6 framing benchmark
npx tsx apps/api/scripts/benchmark_p6_framing.ts
```

All PRs must pass 100% of **Class 1 Hard Acceptance Gates** (0 head cutoffs, 0 chin cutoffs, 0 subtitle collisions) before merging.
