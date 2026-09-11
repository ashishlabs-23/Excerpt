import { ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { ProcessHandle, ProcessExitResult } from '@excerpt/clipping-core';
import { ProcessTreeKiller } from './ProcessTreeKiller';

export class ManagedProcess implements ProcessHandle {
  private child: ChildProcess;
  private _isExited = false;
  private exitPromise: Promise<ProcessExitResult>;
  private exitResolver!: (res: ProcessExitResult) => void;
  private _exitResult: ProcessExitResult | null = null;
  public readonly command: string;
  public readonly args: string[];

  constructor(child: ChildProcess, command: string = '', args: string[] = []) {
    this.child = child;
    this.command = command;
    this.args = args;

    this.exitPromise = new Promise<ProcessExitResult>((resolve) => {
      this.exitResolver = resolve;
    });

    this.child.once('exit', (code, signal) => {
      this._isExited = true;
      this._exitResult = { code, signal };
      this.exitResolver(this._exitResult);
    });

    this.child.once('error', (err) => {
      if (!this._isExited) {
        this._isExited = true;
        this._exitResult = { code: -1, signal: null };
        this.exitResolver(this._exitResult);
      }
    });
  }

  public get pid(): number | undefined {
    return this.child.pid;
  }

  public get isExited(): boolean {
    return this._isExited;
  }

  public get exitResult(): ProcessExitResult | null {
    return this._exitResult;
  }

  public get stdout(): Readable | null {
    return this.child.stdout;
  }

  public get stderr(): Readable | null {
    return this.child.stderr;
  }

  public get rawProcess(): ChildProcess {
    return this.child;
  }

  public async waitForExit(): Promise<ProcessExitResult> {
    if (this._isExited && this._exitResult) {
      return this._exitResult;
    }
    return this.exitPromise;
  }

  /**
   * Terminates the entire process tree using ProcessTreeKiller.
   */
  public async killTree(signal: string = 'SIGTERM', gracePeriodMs: number = 3000): Promise<void> {
    if (this._isExited || !this.pid) {
      return;
    }

    await ProcessTreeKiller.killTree(this.pid, signal as NodeJS.Signals, gracePeriodMs);
    this._isExited = true;
  }

  /**
   * Collects all stdout and stderr strings upon completion.
   */
  public async collectOutput(): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    let stdoutData = '';
    let stderrData = '';

    if (this.child.stdout) {
      this.child.stdout.on('data', (chunk) => {
        stdoutData += chunk.toString();
      });
    }

    if (this.child.stderr) {
      this.child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });
    }

    const exit = await this.waitForExit();
    return {
      stdout: stdoutData,
      stderr: stderrData,
      exitCode: exit.code,
    };
  }
}
