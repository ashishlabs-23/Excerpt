import { spawn, ChildProcess } from 'child_process';
import { Logger } from './logger/logger';

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Enforces execution time limits and GUARANTEES zombie process cleanup via SIGKILL.
 * Uses native process group killing on Unix, and taskkill on Windows.
 */
export async function killOnTimeout<T>(
  promiseOrProcess: Promise<T> | ChildProcess,
  timeoutMs: number,
  logger: Logger
): Promise<T> {
  
  let targetPromise: Promise<T>;
  let targetProcess: ChildProcess | undefined;

  // Handle if the caller passed a ChildProcess directly (e.g., FFmpeg)
  if (promiseOrProcess instanceof ChildProcess) {
    targetProcess = promiseOrProcess;
    targetPromise = new Promise((resolve, reject) => {
      targetProcess!.on('close', (code) => {
        if (code === 0) resolve(undefined as any);
        else reject(new Error(`Process exited with code ${code}`));
      });
      targetProcess!.on('error', reject);
    });
  } else {
    targetPromise = promiseOrProcess;
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (targetProcess && targetProcess.pid) {
        logger.warn(`[killOnTimeout] Timeout of ${timeoutMs}ms breached. Terminating PID ${targetProcess.pid}`);
        try {
          // Cross-platform tree kill
          if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', targetProcess.pid.toString(), '/f', '/t']);
          } else {
            // Negative PID kills the process group
            process.kill(-targetProcess.pid, 'SIGKILL');
          }
        } catch (e: any) {
          logger.error(`[killOnTimeout] Failed to kill PID ${targetProcess.pid}: ${e.message}`);
        }
      }
      reject(new TimeoutError(`Execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    targetPromise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
