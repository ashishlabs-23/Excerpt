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
│   ├── fixtures/                 # Fixed real/synthetic media test inputs
│   └── reports/                  # Generated benchmark outputs, metrics, and scorecards
│
├── datasets/                     # Gold sets, evaluation corpora, and schemas
│   ├── gold/
│   ├── benchmarks/
│   ├── fixtures/
│   └── schemas/
│
├── tools/                        # Developer utilities and offline tools
│
├── docs/                         # CANONICAL SYSTEM OF RECORD
│   ├── README.md                 # This index and authoritative governance rule
│   ├── architecture/             # How the system is built (System overview, pipeline, data flow)
│   ├── adr/                      # Architectural Decision Records (ADR-001 to ADR-005)
│   ├── contracts/                # Canonical stage contracts (Ingestion, Perception, Director, etc.)
│   ├── security/                 # Threat model, secrets management, access control, incident response
│   ├── operations/               # Production runbooks, frozen RetentionService, monitoring, queues
│   ├── testing/                  # Testing strategy, acceptance gates, acceptance sign-offs
│   ├── research/                 # Framing research, dependency audits
│   └── archive/                  # NON-AUTHORITATIVE institutional memory
│       ├── forensic/             # Root-cause investigations
│       ├── historical/           # Historical milestones and past acceptance runs
│       └── superseded/           # Deprecated contracts and prior specs
│
├── README.md                     # Repository overview and quickstart
├── SECURITY.md                   # Public vulnerability reporting policy & supported versions
├── CONTRIBUTING.md               # Developer setup, pull request, and testing standards
├── CODE_OF_CONDUCT.md            # Contributor covenant standard
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
3. **No Secrets in Code or Documentation**:
   `docs/security/SECRETS_MANAGEMENT.md` explains operational procedures for handling secrets; it never contains actual passwords, tokens, API keys, or service-account JSON.
4. **Benchmarks vs Testing Separation**:
   - `benchmarks/reports/` preserves the raw generated measurements, JSON outputs, and scorecards.
   - `docs/testing/` documents the testing strategy, acceptance gates, and sign-off conclusions.
