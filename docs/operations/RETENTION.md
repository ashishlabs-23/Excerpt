---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# RetentionService Operational Specification & Canonical Invariants

> **Status**: FROZEN & VERIFIED (Automated Suite: 20/20 Passing; Live Empty-Sweep & A/B Object Verification Complete).  
> **Service Location**: `apps/api/src/services/RetentionService.ts`  
> **Test Suite**: `apps/api/src/tests/retentionService.test.ts`

---

## 1. Subsystem Scope & Ownership

`RetentionService` governs the lifecycle, expiration, reconciliation, and deletion of media artifacts across local scratch disks and remote cloud object storage (Backblaze B2).

The subsystem is responsible for:
1. Identifying expired media artifacts based on deterministic TTL policies.
2. Preventing orphan object accumulation in B2 without risking fresh active uploads (TOCTOU protection).
3. Reconciling database records with physical storage state.
4. Preserving a tamper-evident, append-only operational audit log (`retention_audit_log`).

---

## 2. Hard Invariants (Frozen)

| Invariant ID | Rule | Operational Guarantee |
| :--- | :--- | :--- |
| **RET-01** | **Fresh Object Protection** | Objects younger than the safety horizon ($T_{\text{now}} - \text{safetyBuffer}$, default $24\text{ h}$) are **strictly protected** from deletion, even if unreferenced in the database. |
| **RET-02** | **Reference Verification** | An object is eligible for deletion **only** if zero active jobs, clips, or render tasks reference its key/hash in Supabase. |
| **RET-03** | **Version-Aware Purge** | For versioned B2 buckets, deletion calls purge all historical and delete-marker versions to eliminate hidden storage costs. |
| **RET-04** | **TOCTOU Safe Locking** | Reconciliation uses database transactions and row-level locks before issuing S3 `DeleteObjects` commands. |
| **RET-05** | **UTC / Cutoff Semantics** | All expiration timestamps are computed using strict UTC ISO strings and millisecond-level cutoff comparisons. |
| **RET-06** | **Concurrent Worker Safety** | Multiple workers running retention sweeps concurrently will not double-delete or corrupt audit records due to atomic claim flags. |

---

## 3. Operational Execution & Runbook

### Running a Scheduled Sweep
Retention sweeps run automatically via scheduled cron:
```bash
# Execute standalone retention sweep
npm run sweep:retention
```

### Dry-Run Verification
To audit eligible objects without performing deletions:
```bash
npx tsx -e "import { RetentionService } from './src/services/RetentionService'; new RetentionService().runSweep({ dryRun: true });"
```

### Emergency Recovery / Rollback
If an object was deleted erroneously or a job failed during sweep:
1. Inspect the `retention_audit_log` table for deleted keys and timestamps.
2. Verify if the source video can be re-acquired via its original URL.
3. Content-addressed sources will re-cache automatically on next request without corrupting database integrity.
