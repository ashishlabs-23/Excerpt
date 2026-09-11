import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export class ProcessTreeKiller {
  /**
   * Checks if a process is currently running.
   */
  public static isProcessAlive(pid: number): boolean {
    if (!pid || pid <= 0) return false;
    try {
      // Sending signal 0 does not kill the process, but checks if it exists and can be signaled
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === 'EPERM'; // Process exists but we lack permission to signal
    }
  }

  /**
   * Waits for a process to terminate or until timeout expires.
   */
  public static async waitForProcessExit(pid: number, timeoutMs: number = 3000): Promise<boolean> {
    const start = Date.now();
    const interval = 50;

    while (Date.now() - start < timeoutMs) {
      if (!this.isProcessAlive(pid)) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }

    return !this.isProcessAlive(pid);
  }

  /**
   * Terminates a process and all of its descendants across Windows and POSIX.
   * 1. Sends SIGTERM (or non-forced signal).
   * 2. Waits for gracePeriodMs.
   * 3. Escalates to SIGKILL / taskkill /T /F if descendants are still alive.
   */
  public static async killTree(
    pid: number | undefined,
    signal: NodeJS.Signals = 'SIGTERM',
    gracePeriodMs: number = 3000
  ): Promise<void> {
    if (!pid || pid <= 0 || !this.isProcessAlive(pid)) {
      return;
    }

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // Windows: taskkill terminates process trees (/T)
      try {
        process.kill(pid, signal);
      } catch {}

      const exited = await this.waitForProcessExit(pid, gracePeriodMs);
      if (exited) return;

      // Force terminate entire process tree
      try {
        await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F']);
      } catch (err: any) {
        const msg = String(err.message || '');
        if (!msg.includes('not found') && !msg.includes('no running instance')) {
          console.warn(`[ProcessTreeKiller]: taskkill warning for PID ${pid}: ${msg}`);
        }
      }
    } else {
      // POSIX: Process group termination
      try {
        // Try process group (-pid), fallback to direct pid
        process.kill(-pid, signal);
      } catch {
        try {
          process.kill(pid, signal);
        } catch {}
      }

      const exited = await this.waitForProcessExit(pid, gracePeriodMs);
      if (exited) return;

      // Force kill
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {}
      }
    }

    // Await exit
    await this.waitForProcessExit(pid, 2000);
  }
}
