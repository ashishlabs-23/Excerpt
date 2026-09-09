# Excerpt Repository Dependency Audit Matrix

**Audit Date**: 2026-09-09  
**Audit Scope**: All 9 Monorepo Packages in `packages/`  
**Standard**: Strict Zero-Tolerance Dependency Verification  

---

## 1. Package Verification Matrix

| Package Name | Runtime Imports | Test Imports | Build References | CI References | Docker References | Workspace Dep | TSConfig Ref | Script Dep | Verified Safe to Delete? |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **`@excerpt/clipping-core`** | **Active** (`apps/api`, `apps/web`) | **Active** (10 test suites) | **Active** (`apps/api/package.json`) | 0 | **Active** (`Dockerfile.render`) | **Active** | **Active** (`tsconfig.json`) | **Active** | **NO (CORE PRODUCTION ASSET)** |
| **`@excerpt/api-types`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/ingestion`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/perception`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/shared-config`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/types`** | 0 | 0 | 0 | 0 | Stale (`Dockerfile`) | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/understanding`**| 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/video-worker`** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **YES (SAFE TO DELETE)** |
| **`@excerpt/shared`** | 0 (Internal to dead pkgs) | 0 (Internal to dead pkgs) | 0 | 0 | 0 | 0 | Stale (`tsconfig.json`) | 0 | **YES (SAFE TO DELETE)** |

---

## 2. Detailed Dimension Breakdown

### A. `@excerpt/api-types`
- **Location**: `packages/api-types`
- **Files**: 13 files
- **Runtime Imports**: 0 in `apps/api/src`, 0 in `apps/web/src` (including `components/dashboard`)
- **Test Imports**: 0
- **Build / CI**: 0 references in `.github/workflows`
- **Docker**: 0 references in `Dockerfile`, `Dockerfile.render`, or `docker-compose.yml`
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### B. `@excerpt/ingestion`
- **Location**: `packages/ingestion`
- **Files**: 69 files
- **Runtime Imports**: 0 in `apps/api` (all media fetching is handled by `apps/api/src/services/download/` and `ytdl-core`), 0 in `apps/web`
- **Test Imports**: 0 outside `packages/ingestion/src/__tests__`
- **Build / CI**: 0 references
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### C. `@excerpt/perception`
- **Location**: `packages/perception`
- **Files**: 38 files
- **Runtime Imports**: 0 in `apps/api` (superseded by frozen P3 `apps/api/src/services/perception/UnifiedPerceptionEngine.ts` and `packages/clipping-core/src/perception`), 0 in `apps/web`
- **Test Imports**: 0 outside `packages/perception/src/__tests__`
- **Build / CI**: 0 references
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### D. `@excerpt/shared-config`
- **Location**: `packages/shared-config`
- **Files**: 3 files
- **Runtime Imports**: 0
- **Test Imports**: 0
- **Build / CI**: 0 references
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### E. `@excerpt/types`
- **Location**: `packages/types`
- **Files**: 3 files (`index.ts`, `package.json`, `package-lock.json`)
- **Runtime Imports**: 0 in `apps/api`, 0 in `apps/web`. Both applications import canonical types strictly from `@excerpt/clipping-core`.
- **Test Imports**: 0
- **Docker**: Legacy `COPY packages/types` in `Dockerfile` and `Dockerfile.render` which never get imported.
- **Verdict**: **SAFE TO DELETE (superseded by `@excerpt/clipping-core`)**

### F. `@excerpt/understanding`
- **Location**: `packages/understanding`
- **Files**: 33 files
- **Runtime Imports**: 0 in `apps/api`, 0 in `apps/web`
- **Test Imports**: 0 outside its internal test
- **Build / CI**: 0 references
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### G. `@excerpt/video-worker`
- **Location**: `packages/video-worker`
- **Files**: 137 files
- **Runtime Imports**: 0 in `apps/api` (production workers live in `apps/api/src/workers/videoWorker.ts` and `renderWorker.ts`), 0 in `apps/web`
- **Test Imports**: 0 outside its internal tests
- **Build / CI**: 0 references
- **Verdict**: **SAFE TO DELETE (100% Dead)**

### H. `@excerpt/shared`
- **Location**: `packages/shared`
- **Files**: 69 files
- **Runtime Imports**: 0 in `apps/api`, 0 in `apps/web`, 0 in `packages/clipping-core`. Only imported by the 7 dead packages listed above.
- **TSConfig**: Referenced in root `tsconfig.json` as a project reference.
- **Verdict**: **SAFE TO DELETE once sibling dead packages are removed**

---

## 3. Production Architecture Graph Post-Cleanup

```text
                        EXCERPT MONOREPO
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
     APPS                   PACKAGES                 DATA & TOOLS
  ├── api                └── clipping-core        ├── benchmarks
  │   ├── src/                                    │   └── datasets/
  │   └── scripts/                                ├── tools/
  └── web                                         │   ├── diagnostics/
      └── src/                                    │   └── research/
                                                  └── supabase/
                                                      └── migrations/
```
