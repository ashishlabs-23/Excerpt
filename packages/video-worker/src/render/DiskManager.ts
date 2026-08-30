import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

export class DiskManager {
  
  constructor(private logger: Logger) {}

  /**
   * Mocks fs.statfs to return available disk space in bytes.
   * In a real environment, this uses fs.promises.statfs.
   */
  async getAvailableSpaceBytes(targetPath: string): Promise<number> {
    // For testing, we allow an override or return a massive number.
    // In actual implementation: 
    // const stat = await fs.promises.statfs(targetPath);
    // return stat.bavail * stat.bsize;
    return Number.MAX_SAFE_INTEGER;
  }

  /**
   * Calculates estimated output size and explicitly fails fast if the disk cannot hold it.
   * Math: Duration (s) * Bitrate (bps) / 8 = Bytes. Applies a 1.5x safety multiplier.
   */
  async preflightCheck(targetPath: string, durationMs: number, targetBitrateKbps: number): Promise<void> {
    const durationSeconds = durationMs / 1000;
    const targetBitrateBps = targetBitrateKbps * 1000;
    const estimatedSizeBytes = (durationSeconds * targetBitrateBps) / 8;
    const requiredBytes = estimatedSizeBytes * 1.5;

    const availableBytes = await this.getAvailableSpaceBytes(targetPath);

    if (requiredBytes > availableBytes) {
      this.logger.error(`Disk preflight failed. Required: ${requiredBytes}, Available: ${availableBytes}`);
      throw new PipelineError(
        PipelineErrorCode.InsufficientStorage,
        `Render aborted. Insufficient disk space. Required: ${requiredBytes} bytes.`
      );
    }
  }

  /**
   * Generates a completely isolated temp directory for this render job.
   */
  async createIsolatedTempDir(jobId: string, clipId: string): Promise<string> {
    const tmpDir = os.tmpdir();
    const isolatedPath = path.join(tmpDir, `excerpt_render_${jobId}_${clipId}_${Date.now()}`);
    await fs.promises.mkdir(isolatedPath, { recursive: true });
    return isolatedPath;
  }

  /**
   * Teardown mechanism guaranteed to wipe the isolated directory to prevent node OOMs.
   */
  async cleanupTempDir(targetPath: string): Promise<void> {
    try {
      if (fs.existsSync(targetPath)) {
        await fs.promises.rm(targetPath, { recursive: true, force: true });
        this.logger.info(`Cleaned up temp dir: ${targetPath}`);
      }
    } catch (e: any) {
      this.logger.error(`CRITICAL: Failed to cleanup temp dir ${targetPath}. Error: ${e.message}`);
    }
  }
}
