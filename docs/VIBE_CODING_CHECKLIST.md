# Spec-Driven Vibe Coding Checklist & Standards

> **Canonical Guide for AI-Assisted Development in Excerpt**  
> *Adapted from the 2026 Spec-Driven Vibe Coding Framework.*

This checklist prevents code rot, context poisoning, and architectural regressions when building features using AI agents (GitHub Copilot, Cursor, Claude Code, Antigravity).

---

## 🧭 The 8-Step Spec-Driven Workflow

### Step 0: Git Inception & Security Baseline (ALWAYS FIRST)
- [ ] Working branch created off `master` (`git checkout -b feat/your-feature-name`).
- [ ] `.gitignore` active (check that `.env`, `.credentials`, and temp outputs like `temp/*.json` are ignored).
- [ ] No uncommitted scaffolding changes. Clean working tree before opening an AI prompt session.

### Step 1: Spec-Driven Feature Document (`docs/contracts/` or `SPEC.md`)
- [ ] Define the user outcome in simple, concrete language.
- [ ] Write acceptance criteria using **Given-When-Then** format.
- [ ] Define non-goals (explicitly what the feature will **NOT** do).
- [ ] Define interface boundaries (Zod schemas, API endpoints, function signatures).

### Step 2: Component & Design Token Alignment
- [ ] In UI development (`apps/web`), use established design tokens (Tailwind classes, Radix/shadcn primitives).
- [ ] Do not invent ad-hoc inline styles or uncoordinated CSS frameworks.
- [ ] Reuse shared components from existing packages before asking AI to code new ones.

### Step 3: Refresh AI Context Anchors
- [ ] Verify that `.github/copilot-instructions.md` and `AGENTS.md` reflect current constraints.
- [ ] When prompting, tag the spec explicitly (e.g. `@SPEC.md` or `@AI_CONTEXT_MEMORY.md`).

### Step 4: Atomic Task Breakdown (`TASK_PLAN.md`)
- [ ] Split large requests into 3–7 atomic tasks.
- [ ] Each task must modify fewer than 15 files.
- [ ] Each task must define its own verification command (e.g. `npm run test:api`).

### Step 5: Checkpointed Agent Execution
- [ ] **Reset conversation context** between major tasks to prevent hallucination cascades.
- [ ] Review diffs file by file. Reject:
  - Stubbed code (`// TODO: implement later`)
  - Suppressed types (`as any`, `@ts-ignore`)
  - Swallowed errors (`|| true`, empty `catch {}`)
- [ ] Micro-commit after each passing step: `git commit -m "feat(scope): concise description"`.

### Step 6: Local Verification Gate
Before pushing code, run:
```bash
# 1. Typecheck
npm run typecheck

# 2. Test suite
npm test
```

### Step 7: Push & CI Automation
- [ ] Push clean commits to remote.
- [ ] Verify that GitHub Actions (`Build and Tests`, `Security Scanners`) pass green.

### Step 8: AI & Human PR Review
- [ ] Check CodeRabbit walkthrough and security comments on the PR.
- [ ] Confirm no regressions against `AI_CONTEXT_MEMORY.md` non-negotiable invariants.
- [ ] Squash and merge.
