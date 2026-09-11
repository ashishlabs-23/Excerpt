import { StageExecutor, ErrorCategory } from '@excerpt/clipping-core';
import { ProductionProcessRunner, TestProcessRunner, ProcessTreeKiller } from '../../infrastructure/process';

describe('P4.1 Process Lifecycle & Tree Termination', () => {
  const runner = new ProductionProcessRunner();

  test('spawns a real process and collects output cleanly', async () => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'cmd.exe' : 'sh';
    const args = isWindows ? ['/c', 'echo ExcerptManagedProcessTest'] : ['-c', 'echo ExcerptManagedProcessTest'];

    const proc = runner.spawn(cmd, args);
    expect(proc.pid).toBeDefined();
    expect(proc.pid).toBeGreaterThan(0);

    const output = await proc.collectOutput();
    expect(output.stdout).toContain('ExcerptManagedProcessTest');
    expect(output.exitCode).toBe(0);
    expect(proc.isExited).toBe(true);
  });

  test('kills a long-running process tree and guarantees process is not alive', async () => {
    const isWindows = process.platform === 'win32';
    // Spawn a long-running process tree
    const cmd = isWindows ? 'cmd.exe' : 'sh';
    const args = isWindows ? ['/c', 'ping -n 60 127.0.0.1 > nul'] : ['-c', 'sleep 60'];

    const proc = runner.spawn(cmd, args);
    const pid = proc.pid;
    expect(pid).toBeDefined();

    // Verify process is alive
    expect(ProcessTreeKiller.isProcessAlive(pid!)).toBe(true);

    // Terminate tree
    await proc.killTree('SIGTERM', 500);

    // Verify process is completely dead
    const isDead = await ProcessTreeKiller.waitForProcessExit(pid!, 3000);
    expect(isDead).toBe(true);
    expect(ProcessTreeKiller.isProcessAlive(pid!)).toBe(false);
  });

  test('StageExecutor timeout invokes killTree on registered ManagedProcess', async () => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'cmd.exe' : 'sh';
    const args = isWindows ? ['/c', 'ping -n 60 127.0.0.1 > nul'] : ['-c', 'sleep 60'];

    let capturedPid: number | undefined;

    await expect(
      StageExecutor.run(
        {},
        {
          stage: 'test_hanging_process',
          component: 'ManagedProcessTest',
          timeoutMs: 200,
          timeoutType: 'process_timeout',
          execute: async (_input, _attempt, context) => {
            const proc = runner.spawn(cmd, args);
            capturedPid = proc.pid;
            context.registerProcess(proc);
            await proc.waitForExit();
            return { success: true };
          },
        }
      )
    ).rejects.toThrow();

    expect(capturedPid).toBeDefined();
    // Verify that StageExecutor killed the registered process tree
    const isDead = await ProcessTreeKiller.waitForProcessExit(capturedPid!, 3000);
    expect(isDead).toBe(true);
    expect(ProcessTreeKiller.isProcessAlive(capturedPid!)).toBe(false);
  });

  test('Acceptance Gate: 100 timeout injections result in 0 orphan processes', async () => {
    const testRunner = new TestProcessRunner();

    // Configure 100 mock processes that hang forever
    for (let i = 0; i < 100; i++) {
      testRunner.queueProcessConfig({
        pid: 20000 + i,
        hangForever: true,
      });
    }

    let timeoutCount = 0;

    for (let i = 0; i < 100; i++) {
      try {
        await StageExecutor.run(
          {},
          {
            stage: `injection_test_${i}`,
            component: 'TestProcessRunner',
            timeoutMs: 10,
            timeoutType: 'process_timeout',
            maxRetries: 1,
            execute: async (_input, _attempt, context) => {
              const handle = testRunner.spawn('ffmpeg', ['-i', 'hanging_input.mp4']);
              context.registerProcess(handle);
              await handle.waitForExit();
            },
          }
        );
      } catch (err: any) {
        if (i === 0) {
          console.log('[DEBUG] Caught error:', err.name, 'message:', err.message, 'category:', err.category, 'errKeys:', Object.keys(err));
        }
        if (err.category === ErrorCategory.TIMEOUT || err.category === 'TIMEOUT' || err.message?.includes('timed out')) {
          timeoutCount++;
        }
      }
    }

    expect(timeoutCount).toBe(100);
    expect(testRunner.spawnedProcesses.length).toBe(100);

    // Assert that every single one of the 100 spawned processes was killed by StageExecutor
    const allKilled = testRunner.spawnedProcesses.every((p) => p.wasKilled && p.isExited);
    expect(allKilled).toBe(true);

    const orphanCount = testRunner.spawnedProcesses.filter((p) => !p.wasKilled).length;
    expect(orphanCount).toBe(0);
  });
});
