---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# Excerpt Architecture

This document describes the high-level architecture of the Excerpt platform, detailing the flow of data, worker lifecycles, and deployment topologies.

## System Overview

Excerpt relies on a Next.js frontend, an Express Node.js worker API, Supabase (PostgreSQL + Auth + Storage edge), and Backblaze B2 for long-term video artifact storage.

## Request Flow

```mermaid
graph TD
    A[Browser / Client] -->|HTTP POST| B[Express API]
    B -->|Insert Job| C[(Supabase Jobs Table)]
    C -->|Realtime Webhook| D[Job Queue Worker]
    D -->|Claim Job| E[Video Worker]
    E -->|Download & Extract| F[yt-dlp & FFmpeg]
    F -->|Analyze| G[AI Provider]
    G -->|Render Clips| H[Render Worker]
    H -->|Upload| I[(Backblaze B2 Storage)]
    I -->|Update State| C
    C -->|Realtime Update| A
```

## Worker Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Claimed: Worker grabs job
    Claimed --> Processing: Download & AI Analysis
    Processing --> Rendering: FFmpeg extraction
    Rendering --> Uploading: Upload to B2
    Uploading --> Completed: Success
    
    Processing --> Failed: Error
    Rendering --> Failed: Error
    Uploading --> Failed: Error
    
    Failed --> Queued: Auto-retry trigger
    Failed --> DeadLetter: Max retries exceeded
```

## Deployment Architecture

```mermaid
graph LR
    A[GitHub Push] -->|Trigger| B[GitHub Actions]
    B -->|Build & Test| C[Security Scans]
    C -->|Push Image| D[Render]
    D -->|Deploy| E[Production API]
    E -->|Poll /health| F[Verify Live Commit]
    F -->|PASS| G[Self-Test & Smoke]
```
