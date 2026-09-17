---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Documentation & Engineering Governance

Welcome to the Excerpt engineering documentation repository. This directory is the canonical, authoritative system of record for Excerpt's architecture, technical contracts, security boundaries, operational runbooks, and testing methodologies.

---

## 🏛️ Authoritative Documentation Rule

> [!IMPORTANT]
> **AUTHORITATIVE DOCUMENTATION RULE**  
> Each topic has **exactly one canonical document**.
>
> - **Architecture** $\rightarrow$ [`docs/architecture/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/architecture/) *(How the system is built)*
> - **Decision** $\rightarrow$ [`docs/adr/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/adr/) *(Why architectural decisions were made)*
> - **Contract** $\rightarrow$ [`docs/contracts/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/contracts/) *(What each subsystem guarantees)*
> - **Security** $\rightarrow$ [`docs/security/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/security/) *(What is protected and how)*
> - **Operations** $\rightarrow$ [`docs/operations/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/operations/) *(How production is run)*
> - **Testing** $\rightarrow$ [`docs/testing/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/testing/) *(How correctness is proven)*
> - **Research** $\rightarrow$ [`docs/research/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/research/) *(What was investigated)*
>
> Everything else is either **generated**, **experimental**, or **archived**.

---

## 📁 Canonical Directory Structure

```text
Excerpt/
│
├── apps/                         # Application layer (api, web)
├── packages/                     # Pure deterministic engines (clipping-core)
├── supabase/                     # PostgreSQL migrations and RLS policies
│
├── benchmarks/                   # MEASURED EVIDENCE (Outside docs/)
│   ├── definitions/              # Test schemas and fixture manifests
│   ├── runners/                  # Benchmark execution harnesses
│   └── reports/                  # Generated benchmark outputs, metrics, and scorecards
│
├── datasets/                     # Evaluation datasets, gold sets, and schemas
│   ├── gold/
│   ├── benchmarks/
│   └── schemas/
│
├── tools/                        # Developer utilities and offline tools
│
├── docs/                         # CANONICAL SYSTEM OF RECORD
│   ├── README.md                 # This index and authoritative governance rule
│   │
│   ├── architecture/             # How the system is built
│   │   ├── README.md
│   │   ├── SYSTEM_OVERVIEW.md
│   │   ├── PIPELINE.md
│   │   ├── DATA_FLOW.md
│   │   ├── RUNTIME_ARCHITECTURE.md
│   │   └── STORAGE_ARCHITECTURE.md
│   │
│   ├── adr/                      # Architectural Decision Records
│   │   ├── README.md
│   │   └── ADR-*.md
│   │
│   ├── contracts/                # Canonical stage contracts
│   │   ├── README.md
│   │   ├── INGESTION.md
│   │   ├── PERCEPTION.md
│   │   ├── CANDIDATE_GENERATION.md
│   │   ├── RANKING.md
│   │   ├── DIRECTOR.md
│   │   ├── CAPTION_PLAN.md
│   │   ├── RENDER_PLAN.md
│   │   ├── RENDER_ENGINE.md
│   │   ├── DELIVERY.md
│   │   ├── VALIDATION.md
│   │   └── RECOVERY.md
│   │
│   ├── security/                 # Security architecture & controls
│   │   └── README.md
│   │
│   ├── operations/               # Production runbooks & operations
│   │   ├── README.md
│   │   ├── RETENTION.md
│   │   ├── MONITORING.md
│   │   └── RUNBOOKS.md
│   │
│   ├── testing/                  # Testing strategy & acceptance gates
│   │   ├── README.md
│   │   ├── TEST_STRATEGY.md
│   │   └── ACCEPTANCE_GATES.md
│   │
│   ├── research/                 # Active research briefs
│   │   └── README.md
│   │
│   └── archive/                  # NON-AUTHORITATIVE institutional memory
│       ├── README.md
│       ├── forensic/             # Root-cause investigations
│       ├── historical/           # Historical milestones and past acceptance runs
│       └── superseded/           # Deprecated contracts and prior specs
│
├── README.md                     # Repository overview and quickstart
├── SECURITY.md                   # Public vulnerability reporting policy & supported versions
├── CONTRIBUTING.md               # Developer setup, pull request, and testing standards
├── CHANGELOG.md                  # Release notes and version history
└── .gitignore
```

---

## 📜 Repository Governance Invariants

1. **Document Status Frontmatter**:
   Every document in `docs/` must include YAML frontmatter:
   ```yaml
   ---
   status: current | draft | experimental | deprecated | superseded | archived
   owner: clipping-core | platform | security | api
   last_reviewed: 2026-09-17
   ---
   ```
2. **Archived Documents Are Non-Authoritative**:
   All files under `docs/archive/` must carry a prominent warning block:
   ```markdown
   > [!WARNING]
   > **STATUS: ARCHIVED / NON-AUTHORITATIVE**
   ```
3. **No Plaintext Secrets**:
   `docs/security/README.md` explains operational procedures for handling secrets; it never contains actual passwords, tokens, API keys, or service-account JSON.
4. **Benchmarks vs Testing Separation**:
   - `benchmarks/reports/` preserves the raw generated measurements, JSON outputs, and scorecards.
   - `docs/testing/` documents the testing strategy and acceptance gates.
