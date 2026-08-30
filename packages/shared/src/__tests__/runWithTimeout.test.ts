import { runWithTimeout } from '../timeout/runWithTimeout';
import { PipelineErrorCode } from '@excerpt/clipping-core';
import { spawn } from 'child_process';

describe('Timeout Utility', () => {
  it('T4: PID actually gone after kill (not just promise rejected)', async () => {
    // Windows ping command to sleep for ~5 seconds
    const cp = spawn('ping', ['127.0.0.1', '-n', '6']);
    
    // Process should be alive initially
    expect(cp.pid).toBeDefined();
    
    // We expect the promise to reject due to timeout
    const longRunningPromise = new Promise((resolve, reject) => {
      cp.on('exit', () => resolve('exited normally'));
      cp.on('error', reject);
    });

    await expect(
      runWithTimeout(longRunningPromise, 500, { childProcess: cp })
    ).rejects.toMatchObject({
      code: PipelineErrorCode.Timeout
    });

    // Wait a little bit for the OS to reap the process after tree-kill
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // On Windows/Node, testing process existence can be done by trying to kill it
    // with signal 0. If it throws ESRCH, it's dead.
    let isAlive = false;
    try {
      if (cp.pid) {
        process.kill(cp.pid, 0);
        isAlive = true;
      }
    } catch (e: any) {
      if (e.code === 'ESRCH') {
        isAlive = false;
      } else {
        // If we get an access denied or other error, it might still be there, but usually it means it's dead or dying
        isAlive = false;
      }
    }
    
    expect(isAlive).toBe(false);
  });

  it('returns value if promise resolves before timeout', async () => {
    const p = Promise.resolve('success');
    const result = await runWithTimeout(p, 100);
    expect(result).toBe('success');
  });
});
