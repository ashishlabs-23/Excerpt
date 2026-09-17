---
status: archived
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Backup & Disaster Recovery

This document outlines disaster recovery targets (RTO/RPO) and backup procedures for database and object stores.

---

## 1. Recovery Objectives

- **Recovery Point Objective (RPO)**: $< 1\text{ hour}$ for database state; $0\text{ hours}$ for finalized uploaded video clips in B2.
- **Recovery Time Objective (RTO)**: $< 30\text{ minutes}$ for API and worker cold restart.

---

## 2. Backup Topology

1. **Supabase PostgreSQL**:
   - Automated point-in-time recovery (PITR) enabled with 7-day retention.
   - Daily pg_dump logical backups exported to encrypted cold storage.
2. **Backblaze B2 Object Storage**:
   - Bucket lifecycle versioning enabled.
   - Source videos are immutable and content-addressed by SHA256; lost sources can be re-fetched from origin URLs.
   - Rendered clips are durable with $99.999999999\%$ annual data durability.

---

## 3. Disaster Recovery Drill

Semi-annual drill verifying:
1. Restoring a PostgreSQL snapshot to a staging database.
2. Running migrations to current HEAD: `npx supabase db push`.
3. Verifying that worker processes can claim and resume active tasks without data loss.
