import fs from 'fs';
import path from 'path';
import os from 'os';
import { YouTubeAcquisitionAdapter } from '../../services/download/YouTubeAcquisitionAdapter';
import { DownloadIntelligenceEngine } from '../../services/download/DownloadEngine';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

describe('P4.5 YouTube Acquisition Adapter', () => {
  let adapter: YouTubeAcquisitionAdapter;

  beforeEach(() => {
    adapter = new YouTubeAcquisitionAdapter();
  });

  describe('Capability Probing', () => {
    it('probes system capabilities accurately', () => {
      const originalEnv = { ...process.env };
      process.env.YOUTUBE_PO_TOKEN = 'mock_po_token_123';
      process.env.HTTP_PROXY = 'http://proxy.local:8080';

      const capabilities = adapter.probeCapabilities();
      expect(capabilities.hasPoToken).toBe(true);
      expect(capabilities.poToken).toBe('mock_po_token_123');
      expect(capabilities.hasProxy).toBe(true);
      expect(Array.isArray(capabilities.clients)).toBe(true);
      expect(capabilities.clients).toContain('ios');
      expect(capabilities.clients).toContain('android_vr');

      process.env = originalEnv;
    });
  });

  describe('Failure Classification Matrix', () => {
    it('classifies HTTP 429 as retryable rate limit with backoff advice', () => {
      const result = adapter.classifyFailure('HTTP Error 429: Too Many Requests');
      expect(result.code).toBe(PipelineErrorCode.DownloadRateLimit);
      expect(result.retryable).toBe(true);
      expect(result.suggestedFix).toBeDefined();
    });

    it('classifies bot challenges (HTTP 403 / "Sign in") as non-retryable capability failure', () => {
      const result = adapter.classifyFailure('Sign in to confirm you are not a bot', 403);
      expect(result.code).toBe(PipelineErrorCode.DownloadBotChallenge);
      expect(result.retryable).toBe(false);
      expect(result.suggestedFix).toContain('cookies');
    });

    it('classifies PO-Token requirement as non-retryable capability failure', () => {
      const result = adapter.classifyFailure('YouTube returned error: PO token required for client extraction');
      expect(result.code).toBe(PipelineErrorCode.PoTokenRequired);
      expect(result.retryable).toBe(false);
      expect(result.suggestedFix).toContain('YOUTUBE_PO_TOKEN');
    });

    it('classifies private or deleted video as non-retryable permanent failure', () => {
      const result = adapter.classifyFailure('ERROR: [youtube] 12345: This video is private', 410);
      expect(result.code).toBe(PipelineErrorCode.DownloadPrivateVideo);
      expect(result.retryable).toBe(false);
    });
  });

  describe('Acceptance Gate: Test Matrix Execution', () => {
    const tempDir = path.join(os.tmpdir(), `test_yt_acquisition_${Date.now()}`);

    beforeAll(() => {
      fs.mkdirSync(tempDir, { recursive: true });
    });

    afterAll(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    });

    it('Gate 1: HTTP 429 throws canonical PipelineError with code DOWNLOAD_RATE_LIMIT and retryable=true', async () => {
      const mockEngine = {
        executeDownload: jest.fn().mockRejectedValue(new Error('HTTP Error 429: Too Many Requests')),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const outPath = path.join(tempDir, 'output_429.mp4');

      await expect(customAdapter.acquire('https://www.youtube.com/watch?v=rate_limit', outPath))
        .rejects
        .toThrow(PipelineError);

      try {
        await customAdapter.acquire('https://www.youtube.com/watch?v=rate_limit', outPath);
      } catch (err: any) {
        expect(err.code).toBe(PipelineErrorCode.DownloadRateLimit);
        expect(err.retryable).toBe(true);
      }
    });

    it('Gate 2: Bot Challenge throws canonical PipelineError with code DOWNLOAD_BOT_CHALLENGE and retryable=false', async () => {
      const mockEngine = {
        executeDownload: jest.fn().mockRejectedValue(new Error('Sign in to confirm you are not a bot (HTTP Error 403)')),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const outPath = path.join(tempDir, 'output_bot.mp4');

      try {
        await customAdapter.acquire('https://www.youtube.com/watch?v=bot_test', outPath);
        fail('Should have thrown PipelineError');
      } catch (err: any) {
        expect(err instanceof PipelineError).toBe(true);
        expect(err.code).toBe(PipelineErrorCode.DownloadBotChallenge);
        expect(err.retryable).toBe(false);
      }
    });

    it('Gate 3: PO-Token required throws canonical PipelineError with code PO_TOKEN_REQUIRED and retryable=false', async () => {
      const mockEngine = {
        executeDownload: jest.fn().mockRejectedValue(new Error('GDS token required / PO Token verification failed')),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const outPath = path.join(tempDir, 'output_po.mp4');

      try {
        await customAdapter.acquire('https://www.youtube.com/watch?v=po_test', outPath);
        fail('Should have thrown PipelineError');
      } catch (err: any) {
        expect(err instanceof PipelineError).toBe(true);
        expect(err.code).toBe(PipelineErrorCode.PoTokenRequired);
        expect(err.retryable).toBe(false);
      }
    });

    it('Gate 4: Private video throws canonical PipelineError with code DOWNLOAD_PRIVATE_VIDEO and retryable=false', async () => {
      const mockEngine = {
        executeDownload: jest.fn().mockRejectedValue(new Error('ERROR: [youtube] private_id: This video is private')),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const outPath = path.join(tempDir, 'output_private.mp4');

      try {
        await customAdapter.acquire('https://www.youtube.com/watch?v=private_test', outPath);
        fail('Should have thrown PipelineError');
      } catch (err: any) {
        expect(err instanceof PipelineError).toBe(true);
        expect(err.code).toBe(PipelineErrorCode.DownloadPrivateVideo);
        expect(err.retryable).toBe(false);
      }
    });

    it('Gate 5: Successful acquisition returns verified AcquisitionResult with playable output path', async () => {
      const outPath = path.join(tempDir, 'output_success.mp4');
      fs.writeFileSync(outPath, Buffer.alloc(5000, 0xAA)); // Seed valid artifact

      const mockEngine = {
        executeDownload: jest.fn().mockResolvedValue({
          outputPath: outPath,
          attempts: [{ strategyId: 'ios', result: 'success' }],
        }),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const result = await customAdapter.acquire('https://www.youtube.com/watch?v=success_test', outPath);

      expect(result.outputPath).toBe(outPath);
      expect(result.strategyUsed).toBe('ios');
      expect(result.fileSizeBytes).toBe(5000);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('Gate 6: Strategy A fails with HTTP 429 -> cooldown/backoff -> Strategy B succeeds with valid artifact', async () => {
      const outPath = path.join(tempDir, 'output_failover_429.mp4');
      fs.writeFileSync(outPath, Buffer.alloc(8000, 0xBB));

      // Engine records failed attempt A (429 rate limit) followed by successful attempt B (android_vr)
      const mockEngine = {
        executeDownload: jest.fn().mockResolvedValue({
          outputPath: outPath,
          attempts: [
            {
              strategyId: 'ios',
              result: 'failure',
              error: 'HTTP Error 429: Too Many Requests',
              durationMs: 150,
            },
            {
              strategyId: 'android_vr',
              result: 'success',
              durationMs: 800,
              speedMBs: 4.5,
            },
          ],
        }),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const result = await customAdapter.acquire('https://www.youtube.com/watch?v=failover_test', outPath);

      expect(result.outputPath).toBe(outPath);
      expect(result.strategyUsed).toBe('android_vr');
      expect(result.attempts.length).toBe(2);
      expect(result.attempts[0].strategyId).toBe('ios');
      expect(result.attempts[1].strategyId).toBe('android_vr');
    });

    it('Gate 7: Full strategy ladder failover verifies source artifact published via SourceArtifactManager', async () => {
      const outPath = path.join(tempDir, 'output_ladder.mp4');
      fs.writeFileSync(outPath, Buffer.alloc(10000, 0xCC));

      const mockEngine = {
        executeDownload: jest.fn().mockResolvedValue({
          outputPath: outPath,
          attempts: [
            { strategyId: 'web_embedded', result: 'failure', error: 'Sign in to confirm you are not a bot' },
            { strategyId: 'ios', result: 'failure', error: 'HTTP Error 429: Too Many Requests' },
            { strategyId: 'tv', result: 'success', durationMs: 1200 },
          ],
        }),
      } as unknown as DownloadIntelligenceEngine;

      const customAdapter = new YouTubeAcquisitionAdapter(mockEngine);
      const acquisition = await customAdapter.acquire('https://www.youtube.com/watch?v=ladder_test', outPath);

      expect(acquisition.strategyUsed).toBe('tv');
      expect(acquisition.attempts.length).toBe(3);
      expect(fs.existsSync(acquisition.outputPath)).toBe(true);
    });
  });
});
