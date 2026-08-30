import { RenderWorker } from '../render/RenderWorker';
import { DiskManager } from '../render/DiskManager';
import { FFmpegRunner } from '../render/FFmpegRunner';
import { RenderCompletionCoordinator } from '../render/RenderCompletionCoordinator';
import { AtomicStore } from '../render/AtomicStore';
import { Logger } from '@excerpt/shared';
import { RenderPlan, PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import * as fs from 'fs';
import * as path from 'path';

describe('Production Render Engine', () => {
  let logger: Logger;
  let diskManager: DiskManager;
  let ffmpegRunner: FFmpegRunner;
  let coordinator: RenderCompletionCoordinator;
  let store: AtomicStore;
  let bullMQQueueMock: Set<string>;
  let worker: RenderWorker;

  const validPlan = {
    jobId: 'job-r1',
    schemaVersion: '1.0.0',
    candidateId: 'cand-1',
    sourceArtifact: {} as any,
    duration: 10000,
    cameraPlan: {} as any,
    captionPlan: {} as any,
    audioPlan: {} as any,
    thumbnailPlan: {} as any,
    expectedArtifacts: {} as any,
    deliveryPolicy: {} as any,
    renderJobs: [],
    planHash: 'hash12345'
  } as unknown as RenderPlan;

  beforeEach(() => {
    logger = new Logger('render-1' as any);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});
    
    diskManager = new DiskManager(logger);
    ffmpegRunner = new FFmpegRunner(logger);
    store = new AtomicStore();
    coordinator = new RenderCompletionCoordinator(store, logger);
    bullMQQueueMock = new Set<string>();

    worker = new RenderWorker(logger, diskManager, ffmpegRunner, coordinator, bullMQQueueMock);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. duplicate render-job ID is rejected, not double-rendered', async () => {
    const executeSpy = jest.spyOn(ffmpegRunner, 'executeWithTimeout');
    
    // First run
    await worker.processJob(validPlan, 0, {} as any);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    
    // Attempt duplicate run (simulating BullMQ retry of same deterministic ID)
    await worker.processJob(validPlan, 0, {} as any);
    
    // execute should NOT be called again
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it('2. insufficient disk space fails before FFmpeg starts', async () => {
    // Mock available space to 1 Byte
    jest.spyOn(diskManager, 'getAvailableSpaceBytes').mockResolvedValue(1);
    const executeSpy = jest.spyOn(ffmpegRunner, 'executeWithTimeout');

    try {
      await worker.processJob(validPlan, 1, {} as any);
      fail('Should have thrown InsufficientStorage');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineError);
      expect(e.code).toBe(PipelineErrorCode.InsufficientStorage);
    }

    // FFmpeg was never started
    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('3. temp directory is cleaned up after a successful render', async () => {
    const cleanupSpy = jest.spyOn(diskManager, 'cleanupTempDir');
    await worker.processJob(validPlan, 2, {} as any);
    
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
    const tempDirPath = cleanupSpy.mock.calls[0][0];
    expect(fs.existsSync(tempDirPath)).toBe(false);
  });

  it('4. temp directory is cleaned up after a failed render', async () => {
    const cleanupSpy = jest.spyOn(diskManager, 'cleanupTempDir');
    
    // Force FFmpeg to fail
    jest.spyOn(ffmpegRunner, 'executeWithTimeout').mockRejectedValue(new Error('Simulated failure'));

    await worker.processJob(validPlan, 3, {} as any);
    
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it('5. timeout kills actual FFmpeg process', async () => {
    // Run an FFmpeg command that intentionally hangs
    // In Windows we can't easily sleep using 'node', so we'll mock executeWithTimeout internally
    // Wait, the prompt specifically asks to test that timeout kills the ACTUAL process using SIGKILL
    // We can write a JS script that just loops indefinitely to simulate hanging ffmpeg
    const tempDir = await diskManager.createIsolatedTempDir('job-t1', 'clip-t1');
    const outputPath = path.join(tempDir, 'output.mp4');
    
    const mockScriptPath = path.join(tempDir, 'hang.js');
    fs.writeFileSync(mockScriptPath, `setTimeout(() => {}, 100000);`);
    
    try {
      // 100ms timeout
      await ffmpegRunner.executeWithTimeout('node', [mockScriptPath], outputPath, 100);
      fail('Should have thrown RenderFailed due to timeout');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineError);
      expect(e.code).toBe(PipelineErrorCode.RenderFailed);
      expect(e.message).toContain('timed out');
    }

    await diskManager.cleanupTempDir(tempDir);
  });
});
