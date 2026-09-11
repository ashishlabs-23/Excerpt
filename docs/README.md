# Excerpt Documentation & Architecture Governance

Welcome to the Excerpt engineering documentation repository. This directory houses architectural decisions, domain invariant contracts, operational runbooks, research, and institutional archives.

---

## 🏛️ Directory Layout

```text
docs/
├── architecture/         # Active architecture specifications, system baselines, and UI contracts
├── contracts/            # Canonical stage contracts explaining non-obvious invariants and domain rules
├── operations/           # Operational runbooks, tech debt registers, and monitoring specs
├── research/             # Dependency evaluations, ecosystem research, and external API investigations
└── archive/              # Preserved institutional knowledge and historical audits
    ├── forensic/         # Forensic root-cause investigations and pipeline audits
    ├── milestones/       # Milestone completion and acceptance test reports
    └── superseded/       # Previous architectural revisions replaced by newer specs
```

---

## 📜 Documentation Governance Policy

All developers and AI agents operating within Excerpt must adhere strictly to the following governance rules:

1. **No Milestone Reports in `apps/api/`**:
   Never create benchmark scorecards, milestone summaries, or acceptance reports in the application source directories.
2. **No Loose Documents at `docs/` Root**:
   Do not dump one-off architecture documents at the `docs/` root. Route all documents into their proper subfolder (`architecture/`, `contracts/`, `operations/`, `research/`, or `archive/`).
3. **Runtime Prompts Co-located with Code**:
   Runtime `*.md` files (such as LLM evaluation prompts, ranking templates, or few-shot examples) are runtime code assets and must live inside `packages/clipping-core/src/...` beside the code that loads them.
4. **Benchmark Reports Belong in `benchmarks/reports/`**:
   Benchmark run outputs, scorecards, and soak reports belong under `benchmarks/reports/` (subdivided by phase: `p2/`, `p3/`, `p3.1/`, `editorial/`, `soak/`, etc.). Benchmark execution code belongs in `benchmarks/runners/`, and schemas belong in `benchmarks/definitions/`.
5. **Historical Investigations Belong in `docs/archive/`**:
   Do not delete investigative audits or forensic reports. Move them to `docs/archive/forensic/` or `docs/archive/milestones/` and register them in `docs/archive/README.md`.
6. **New ADRs Must Be Linked**:
   Any new architectural decision records (ADRs) must be cataloged in `docs/architecture/` and linked from the central architecture index.
7. **TypeScript Contracts vs. Markdown Contracts**:
   Never duplicate a TypeScript type or interface in Markdown unless the Markdown explains invariants, domain rationale, operational failure modes, or boundary guarantees that cannot be expressed in TypeScript types alone.

---

## 📑 Contract Invariant Test

Before creating or retaining a markdown document in `docs/contracts/`, verify:

> **"Does deleting this document make it materially harder to understand a current system invariant or operational rule?"**

- If **YES** (e.g., explaining why `renderJobs.length === acceptedCandidates.length`, or hash immutability requirements) $\rightarrow$ Retain in `docs/contracts/`.
- If **NO** (mere type duplication or superseded interface) $\rightarrow$ Move to `docs/archive/superseded/` or delete.
