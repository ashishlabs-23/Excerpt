<div align="center">

<img src="https://img.shields.io/badge/Excerpt-AI%20Video%20Clipping-orange?style=for-the-badge&logo=youtube&logoColor=white" alt="Excerpt" />

# ✂️ Excerpt — AI Video Clipping Platform

**Transform long-form videos into viral, 9:16 vertical publishable clips — automatically.**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%20%26%20RLS-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)
[![Backblaze B2](https://img.shields.io/badge/Backblaze-B2%20Cloud%20Storage-E02424?style=flat-square&logo=backblaze)](https://backblaze.com)

[📖 Documentation](docs/README.md) · [🔒 Security](SECURITY.md) · [🤝 Contributing](CONTRIBUTING.md) · [📜 Code of Conduct](CODE_OF_CONDUCT.md) · [📝 Changelog](CHANGELOG.md)

</div>

---

## 🎯 What is Excerpt?

Excerpt is an **autonomous AI video clipping platform** that ingests long-form video content and automatically extracts, reframes to 9:16 vertical, captions, and prepares publication-ready clips.

```text
Source Video ──► Multimodal Perception ──► Candidate Gen ──► Contextual Director ──► 9:16 Compositing ──► B2 Delivery
```

---

## 🏛️ Authoritative Documentation & Architecture

Excerpt enforces a strict **single source of truth** documentation governance model:

```text
                    EXCERPT CANONICAL DOCS

ARCHITECTURE    How the system is built     ──► docs/architecture/
ADRs            Why decisions were made     ──► docs/adr/
CONTRACTS       What stages guarantee       ──► docs/contracts/
SECURITY        What is protected and how   ──► docs/security/
OPERATIONS      How production is run       ──► docs/operations/
TESTING         How correctness is proven   ──► docs/testing/
RESEARCH        What was investigated       ──► docs/research/
ARCHIVE         Historical context          ──► docs/archive/
```

See the master index in [`docs/README.md`](docs/README.md).

---

## 📁 Repository Structure

```text
Excerpt/
├── apps/
│   ├── api/                 # Express API + Video/Render Background Workers
│   └── web/                 # Next.js 14 frontend studio & playback reviewer
├── packages/
│   └── clipping-core/       # Pure deterministic clipping & framing engine
├── benchmarks/              # Test corpora, runners, and measured output reports
│   ├── definitions/
│   ├── fixtures/
│   ├── runners/
│   └── reports/
├── datasets/                # Evaluation datasets, gold sets, and schemas
├── tools/                   # Offline developer utilities and diagnostics
├── supabase/                # PostgreSQL migrations & RLS policies
├── docs/                    # Canonical system of record
├── SECURITY.md              # Public vulnerability reporting policy
├── CONTRIBUTING.md          # Engineering workflow and PR guidelines
├── CODE_OF_CONDUCT.md       # Contributor covenant standard
├── CHANGELOG.md             # Release version history
└── render.yaml              # Backend deployment specification
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- FFmpeg 6.0+ with libass on PATH
- Supabase Project & Backblaze B2 Bucket

### 1. Clone & Install

```bash
git clone https://github.com/ashishlabs-23/Excerpt.git
cd Excerpt
npm install
```

### 2. Verify Pipeline & Tests

```bash
# Run pure clipping-core unit tests
npm run test:core

# Run API & subsystem tests
npm run test:api

# Run P6 framing benchmark
npx tsx apps/api/scripts/benchmark_p6_framing.ts
```

---

## 📄 License

Private repository — all rights reserved © 2026 Ashish Labs.
