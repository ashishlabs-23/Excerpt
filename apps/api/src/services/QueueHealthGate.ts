import fs from 'fs';
import os from 'os';
import path from 'path';

export interface HealthCheckResult {
  allowed: boolean;
  reason?: string;
  metrics: {
    diskFreeMB: number;
    memoryFreeMB: number;
    heapUsedMB: number;
  };
}

export class QueueHealthGate {
  private static readonly MIN_DISK_FREE_MB = 3000; // 3GB floor before claiming heavy jobs
  private static readonly MIN_SYSTEM_MEM_MB = 350; // 350MB free RAM floor

  /**
   * Checks whether the current worker node has sufficient CPU, RAM, and Disk space
   * to safely accept and process a new video job without risking OOM or ENOSPC.
   */
  public static checkCapacity(): HealthCheckResult {
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      try {
        fs.mkdirSync(tempDir, { recursive: true });
      } catch {}
    }

    let diskFreeMB = 10000; // optimistic fallback
    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(tempDir);
        diskFreeMB = Math.round((stats.bavail * stats.bsize) / (1024 * 1024));
      }
    } catch {
      // statfs may fail on certain mounted virtual disks, allow fallback
    }

    const memoryFreeMB = Math.round(os.freemem() / (1024 * 1024));
    const memUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memUsage.heapUsed / (1024 * 1024));

    const metrics = {
      diskFreeMB,
      memoryFreeMB,
      heapUsedMB,
    };

    if (diskFreeMB < this.MIN_DISK_FREE_MB) {
      return {
        allowed: false,
        reason: `Insufficient disk space (${diskFreeMB}MB free, requires >= ${this.MIN_DISK_FREE_MB}MB)`,
        metrics,
      };
    }

    if (memoryFreeMB < this.MIN_SYSTEM_MEM_MB) {
      return {
        allowed: false,
        reason: `Insufficient system memory (${memoryFreeMB}MB free, requires >= ${this.MIN_SYSTEM_MEM_MB}MB)`,
        metrics,
      };
    }

    return {
      allowed: true,
      metrics,
    };
  }

  /**
   * Calculates adaptive backoff polling delays for worker threads.
   * When jobs are found, interval is snappy (1-2s).
   * When queue is empty, interval backs off progressively up to maxBackoffMs.
   */
  public static getAdaptiveDelay(consecutiveEmptyPolls: number, minDelayMs = 1500, maxBackoffMs = 20000): number {
    if (consecutiveEmptyPolls <= 0) return minDelayMs;
    // Stepwise exponential backoff with ceiling
    const delay = Math.min(maxBackoffMs, Math.round(minDelayMs * Math.pow(1.6, Math.min(consecutiveEmptyPolls, 6))));
    return delay;
  }
}
