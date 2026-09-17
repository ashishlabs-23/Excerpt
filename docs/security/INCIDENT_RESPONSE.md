---
status: current
owner: security
last_reviewed: 2026-09-17
---

# Excerpt Security Incident Response Plan

This runbook outlines procedures for triaging, containing, remediating, and documenting security incidents.

---

## 1. Severity Levels

| Severity | Definition | Target Response Time | Escalation |
| :--- | :--- | :--- | :--- |
| **SEV-1 (Critical)** | Active data exfiltration, compromised master secrets, remote code execution. | $< 15\text{ minutes}$ | Page all platform leads immediately. |
| **SEV-2 (High)** | SSRF bypass discovered, unauthorized access to single-user media, auth token bypass. | $< 1\text{ hour}$ | Platform & security on-call. |
| **SEV-3 (Medium)** | Non-exploitable vulnerability in dependency, rate limit bypass. | $< 24\text{ hours}$ | Scheduled patch sprint. |

---

## 2. Response Workflow

1. **Identification**: Triage alert from log monitors, security scanner, or external disclosure.
2. **Containment**:
   - Compromised credentials: Revoke immediately.
   - Malicious IP / URL abuse: Block traffic at ingress / cloud firewall.
   - Flawed container: Drain worker queue and stop vulnerable container instance.
3. **Eradication & Recovery**: Apply patch, re-verify tests, deploy updated container, and restore worker queues.
4. **Post-Mortem**: Document root cause, timeline, impact, and preventative actions within 72 hours under [`docs/archive/forensic/`](file:///c:/Projects/Ashishlabs/Excerpt/docs/archive/forensic/).
