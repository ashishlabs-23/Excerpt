---
Version: 2.0
Last Updated: 2026-07-06
Applies To: Excerpt API v2
Owner: Engineering
---

# API Reference

This document outlines the core internal system and telemetry endpoints for Excerpt. 
These endpoints are not intended for public consumption and require strict authorization.

## Authentication
All `/api/system/*` endpoints (except `/health`) require a valid JWT via the `Authorization: Bearer <token>` header. The JWT is verified against the Supabase `SUPABASE_JWT_SECRET`.

---

## Endpoints

### `GET /health`
Liveness check used by load balancers and CI systems. Does not touch external databases.

**Response (200 OK)**
```json
{
  "status": "ok",
  "commit": "a1b2c3d",
  "buildTime": "2026-07-06T10:00:00.000Z",
  "version": "1.0.0"
}
```

---

### `GET /api/system/live`
Operational runtime state. Returns internal telemetry without making external service calls (relies on cached/active worker memory).

**Response (200 OK)**
```json
{
  "status": "active",
  "capacity": 85,
  "activeJobs": 1,
  "memoryUsage": 45,
  "uptime": 3600.5,
  "workerRegistry": [
    {
      "label": "worker-1",
      "pid": 1234,
      "running": true,
      "restartCount": 0,
      "uptime": 3600000
    }
  ],
  "versions": {
    "commit": "a1b2c3d",
    "branch": "master",
    "tag": "none",
    "buildNumber": "123",
    "nodeVersion": "v20.0.0",
    "workerVersion": "1.0.0",
    "downloadEngineVersion": "yt-dlp",
    "apiVersion": "1.0.0",
    "schemaVersion": "1.0.0",
    "workerProtocolVersion": "1.0.0",
    "dashboardProtocolVersion": "1.0.0",
    "buildTimestamp": "2026-07-06T10:00:00.000Z"
  }
}
```

---

### `GET /api/system/self-test`
Active dependency verification. Pings all downstream integrations to ensure the environment is correctly configured.

**Response (200 OK)**
```json
{
  "overall": "PASS",
  "checks": [
    {
      "name": "Supabase",
      "status": "PASS",
      "latency_ms": 42
    },
    {
      "name": "FFmpeg",
      "status": "PASS",
      "latency_ms": 5
    }
  ]
}
```

---

### `POST /api/video/jobs`
Submit a new video for processing.

**Request Body**
```json
{
  "url": "https://youtube.com/watch?v=...",
  "options": {
    "length": "medium"
  }
}
```

**Response (200 OK)**
```json
{
  "jobId": "uuid-...",
  "status": "queued"
}
```
