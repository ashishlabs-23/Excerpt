## 📋 Pull Request Description

### Summary of Changes
<!-- Provide a clear, high-level summary of what this PR introduces or fixes. -->

### Related Issue / Spec
- Closes #<!-- issue number -->
- Spec Document: <!-- link or path to docs/contract or spec -->

---

## 🛡️ Vibe Coding & Invariant Verification Checklist

Please verify before requesting review:

- [ ] **Inception & Git**: Developed in an isolated branch with clean micro-commits.
- [ ] **Architectural Invariants**:
  - [ ] No regression on TalkNet MAR lip motion weighting (framing).
  - [ ] No downgrade of 1080p CRF 17 render quality.
  - [ ] Video playback streaming (HTTP 206) preserved.
- [ ] **No Hallucinations or Stubs**:
  - [ ] No placeholder stubs (`// TODO: implement later`).
  - [ ] No unnecessary or unvetted npm packages added.
  - [ ] No TypeScript errors bypassed via `any` or `@ts-ignore`.
- [ ] **Deterministic Local Verification**:
  - [ ] `npm run typecheck` passes with 0 errors.
  - [ ] `npm test` passes with all tests green.
- [ ] **CI & CodeRabbit**:
  - [ ] GitHub Actions CI passed.
  - [ ] CodeRabbit review comments addressed.
