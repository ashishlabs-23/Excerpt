---
status: current
owner: platform
last_reviewed: 2026-09-17
---

# Excerpt Monitoring, Observability & Health Probes

This document specifies logging standards, metrics tracking, health probes, and alert triggers across Excerpt.

---

## 1. Structured Logging Standard

All API components, workers, and pipeline stages emit structured JSON logs via Winston to `stdout`:

```json
{
  "timestamp": "2026-09-17T14:30:00.000Z",
  "level": "info",
  "service": "api",
  "jobId": "job_984f4362",
  "stage": "DirectorStage",
  "message": "Reframe plan computed successfully",
  "durationMs": 412,
  "metrics": {
    "evaluatedFrames": 1540,
    "cameraModeSwitches": 4,
    "p95CropDelta": 0.042
  }
}
```

---

## 2. Health Probes

| Probe Endpoint | Target Port | Probe Type | Success Condition |
| :--- | :--- | :--- | :--- |
| `GET /health` | 4000 | Liveness | HTTP 200, Process responsive, memory $< 90\%$ quota |
| `GET /health/ready` | 4000 | Readiness | HTTP 200, PostgreSQL reachable, B2 bucket accessible |
| `GET /health/worker` | 4000 | Worker Status | Active child FFmpeg processes within concurrency limit ($\le 4$) |

---

## 3. Critical Alerts & Thresholds

- **Job Failure Rate Spike**: Alert if $> 5\%$ of jobs fail in a rolling 15-minute window.
- **Queue Backlog**: Alert if pending jobs $> 50$ for $> 10\text{ minutes}$.
- **FFmpeg Zombie Watchdog**: Alert if any child PID remains active $> 60\text{ s}$ past its stage timeout.
- **Disk Saturation**: Alert if NVMe scratch disk usage exceeds $80\%$.
