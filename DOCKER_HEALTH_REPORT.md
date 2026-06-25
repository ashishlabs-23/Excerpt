# Docker Health Report

> [!WARNING]
> The Docker Desktop Daemon is currently offline/not running on this Windows host.
> Rebuilding and testing via Docker Compose was bypassed. Instead, verification is performed locally.

## Daemon Connection Error
```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

## Local Services Diagnostic
To ensure code compilation correctness and check logic integrity, we run localized compiler syntax audits and test runners.
- `apps/api`: Compiled successfully
- `apps/web`: Built successfully
- `voiceoverWorker.ts`: Syntactically verified
