# Changelog

All notable changes to the Excerpt engineering platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- **Canonical Documentation Taxonomy**: Established unified hierarchy across `architecture/`, `adr/`, `contracts/`, `security/`, `operations/`, `testing/`, `research/`, and `archive/`.
- **Architectural Decision Records**: Cataloged `ADR-001` through `ADR-005` covering retained worker architecture, Supabase persistence, content addressing, deterministic execution, and feasible crop regions.
- **Root Governance Policies**: Added `SECURITY.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`.
- **P6 Framing Benchmark & Quality Telemetry**: Added two-class evaluation separating Class 1 safety gates from Class 2 continuous trajectory quality metrics.

### Changed
- **SmartReframeEngine**: Fixed normalized vs physical coordinate space bug; enforced Feasible Crop Region $[y_{\min}, y_{\max}]$ guaranteeing $\ge 5\%$ headroom and lower $22\%$ subtitle clearance.
- **Benchmark Separation**: Separated measured benchmark outputs (`benchmarks/reports/`) from testing methodology and acceptance decisions (`docs/testing/`).

### Fixed
- **RetentionService**: Hardened 20/20 automated edge cases, TOCTOU safety, Backblaze B2 version-aware purge, and live A/B object sweep protection.
