import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { ChildProcess, execSync } from 'child_process';

export interface RunWithTimeoutOptions {
  onTimeout?: () => void;
  childProcess?: ChildProcess;
}

function killProcessSafely(childProcess: ChildProcess | undefined, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): void {
  if (!childProcess || !childProcess.pid) return;
  const pid = childProcess.pid;
  try {
    if (process.platform === 'win32') {
      try {
        execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      } catch {
        childProcess.kill(signal);
      }
    } else {
      try {
        process.kill(-pid, signal);
      } catch {
        process.kill(pid, signal);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

export async function runWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  options?: RunWithTimeoutOptions
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      if (options?.onTimeout) {
        options.onTimeout();
      }
      
      if (options?.childProcess?.pid) {
        killProcessSafely(options.childProcess, 'SIGTERM');

        setTimeout(() => {
          killProcessSafely(options.childProcess, 'SIGKILL');
        }, 1000).unref();
      }

      reject(new PipelineError(PipelineErrorCode.Timeout, `Operation timed out after ${ms}ms`));
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId!);
  }
}
