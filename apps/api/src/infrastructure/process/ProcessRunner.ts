import { spawn, SpawnOptions } from 'child_process';
import { ProcessRunner, ProcessHandle, ProcessExitResult } from '@excerpt/clipping-core';
import { ManagedProcess } from './ManagedProcess';

export class ProductionProcessRunner implements ProcessRunner {
  public spawn(command: string, args: string[] = [], options: SpawnOptions = {}): ProcessHandle {
    const isWindows = process.platform === 'win32';
    const spawnOpts: SpawnOptions = {
      ...options,
      detached: isWindows ? false : (options.detached ?? false),
    };

    const child = spawn(command, args, spawnOpts);
    return new ManagedProcess(child, command, args);
  }
}

export interface MockProcessConfig {
  pid?: number;
  exitCode?: number;
  exitSignal?: string;
  delayMs?: number;
  hangForever?: boolean;
}

export class MockProcessHandle implements ProcessHandle {
  public pid: number;
  public isExited = false;
  public wasKilled = false;
  public killSignalReceived?: string;
  private exitPromise: Promise<ProcessExitResult>;
  private exitResolver!: (res: ProcessExitResult) => void;

  constructor(config: MockProcessConfig = {}) {
    this.pid = config.pid || Math.floor(10000 + Math.random() * 50000);
    const delay = config.delayMs ?? 100;
    const exitCode = config.exitCode ?? 0;
    const exitSignal = config.exitSignal ?? null;

    this.exitPromise = new Promise<ProcessExitResult>((resolve) => {
      this.exitResolver = resolve;
    });

    if (!config.hangForever) {
      setTimeout(() => {
        if (!this.isExited) {
          this.isExited = true;
          this.exitResolver({ code: exitCode, signal: exitSignal });
        }
      }, delay);
    }
  }

  public async killTree(signal: string = 'SIGTERM', gracePeriodMs: number = 50): Promise<void> {
    this.wasKilled = true;
    this.killSignalReceived = signal;
    this.isExited = true;
    this.exitResolver({ code: null, signal: signal });
  }

  public async waitForExit(): Promise<ProcessExitResult> {
    return this.exitPromise;
  }

  public async collectOutput(): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const exit = await this.waitForExit();
    return {
      stdout: '',
      stderr: '',
      exitCode: exit.code,
    };
  }
}

export class TestProcessRunner implements ProcessRunner {
  private configs: MockProcessConfig[] = [];
  public spawnedProcesses: MockProcessHandle[] = [];

  constructor(configs: MockProcessConfig[] = []) {
    this.configs = [...configs];
  }

  public queueProcessConfig(config: MockProcessConfig) {
    this.configs.push(config);
  }

  public spawn(command: string, args: string[] = [], options?: any): ProcessHandle {
    const config = this.configs.shift() || {};
    const handle = new MockProcessHandle(config);
    this.spawnedProcesses.push(handle);
    return handle;
  }
}
