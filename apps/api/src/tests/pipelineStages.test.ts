import { IngestionStage } from '../workers/stages/IngestionStage';
import { TranscriptionStage } from '../workers/stages/TranscriptionStage';
import { CandidateStage } from '../workers/stages/CandidateStage';
import { PlanningStage } from '../workers/stages/PlanningStage';
import { QueueHealthGate } from '../services/QueueHealthGate';
import { RotatingProxyProvider } from '../services/download/ProxyProvider';
import { createDefaultContext } from '../services/intelligence/PipelineContext';
import fs from 'fs';
import path from 'path';

describe('Modular Pipeline Stages', () => {
  describe('QueueHealthGate', () => {
    it('returns health check status and resource metrics', () => {
      const status = QueueHealthGate.checkCapacity();
      expect(typeof status.allowed).toBe('boolean');
      expect(typeof status.metrics.memoryFreeMB).toBe('number');
      expect(typeof status.metrics.diskFreeMB).toBe('number');
      expect(typeof status.metrics.heapUsedMB).toBe('number');
      expect(status.metrics.memoryFreeMB).toBeGreaterThan(0);
    });

    it('calculates adaptive delay correctly based on empty poll counts', () => {
      const normalDelay = QueueHealthGate.getAdaptiveDelay(0);
      expect(normalDelay).toBe(1500);

      const backedOffDelay = QueueHealthGate.getAdaptiveDelay(3);
      expect(backedOffDelay).toBeGreaterThan(normalDelay);

      const maxDelay = QueueHealthGate.getAdaptiveDelay(10);
      expect(maxDelay).toBeLessThanOrEqual(20000);
    });
  });

  describe('RotatingProxyProvider', () => {
    it('rotates proxies in round-robin fashion', () => {
      const provider = new RotatingProxyProvider(['http://proxy1:8080', 'http://proxy2:8080']);
      const p1 = provider.getProxyUrl();
      const p2 = provider.getProxyUrl();
      const p3 = provider.getProxyUrl();

      expect(p1).toBe('http://proxy1:8080');
      expect(p2).toBe('http://proxy2:8080');
      expect(p3).toBe('http://proxy1:8080');
    });

    it('cools down rate-limited proxies upon markFailed', () => {
      const provider = new RotatingProxyProvider(['http://proxy1:8080', 'http://proxy2:8080']);
      provider.markFailed('http://proxy1:8080');

      // proxy1 should now be cooled down, leaving proxy2 as the candidate
      const next1 = provider.getProxyUrl();
      const next2 = provider.getProxyUrl();
      expect(next1).toBe('http://proxy2:8080');
      expect(next2).toBe('http://proxy2:8080');
    });
  });

  describe('CandidateStage', () => {
    it('filters candidates through Critic and ranks them', async () => {
      const stage = new CandidateStage();
      const mockAiService: any = {
        detectClips: jest.fn().mockResolvedValue([
          { id: 'c1', start_time: 0, end_time: 30, title: 'Clip 1', virality_score: 90 },
        ]),
      };

      const context = createDefaultContext('test_job');
      const result = await stage.execute({
        jobId: 'test_job',
        videoUrl: 'https://youtube.com/watch?v=123',
        numClips: 2,
        sourceDuration: 120,
        transcriptionText: 'Hello world this is a test transcript for clipping.',
        segments: [{ text: 'Hello world', start: 0, end: 10 }],
        aiService: mockAiService,
        pipelineContext: context,
      });

      expect(result.success).toBe(true);
      expect(result.data?.candidates).toBeDefined();
      expect(result.data?.candidates.length).toBeGreaterThan(0);
    });
  });

  describe('PlanningStage', () => {
    it('enforces minimum duration protocols and generates render jobs', async () => {
      const stage = new PlanningStage();
      const mockDb: any = {
        getRenderCache: jest.fn().mockResolvedValue(null),
        getSupabase: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
        }),
        saveClips: jest.fn().mockResolvedValue(true),
      };

      const clips = [
        {
          id: 'clip_valid',
          start_time: 10,
          end_time: 35,
          title: 'Valid Clip',
          virality_score: 85,
        },
        {
          id: 'clip_too_short',
          start_time: 10,
          end_time: 15, // 5s < 14.9s minimum on source >= 30s
          title: 'Too Short Clip',
          virality_score: 50,
        },
      ];

      const result = await stage.execute({
        jobId: 'test_job_planning',
        videoUrl: 'https://youtube.com/watch?v=123',
        clips,
        sourceDuration: 100,
        words: [],
        generationMode: 'ai',
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.data?.dbClips.length).toBe(1);
      expect(result.data?.dbClips[0].id).toBe('clip_valid');
      expect(result.data?.pendingRenderJobs.length).toBe(1);
      expect(mockDb.saveClips).toHaveBeenCalled();
    });

    it('bypasses render queue when L5 cache hits', async () => {
      const stage = new PlanningStage();
      const mockDb: any = {
        getRenderCache: jest.fn().mockResolvedValue({
          storage_path: 's3://bucket/cached.mp4',
          thumbnail_path: 's3://bucket/thumb.jpg',
        }),
        getSupabase: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockReturnValue({
                maybeSingle: jest.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }),
        }),
        saveClips: jest.fn().mockResolvedValue(true),
      };

      const clips = [
        {
          id: 'clip_cached',
          start_time: 10,
          end_time: 35,
          title: 'Cached Clip',
          virality_score: 95,
        },
      ];

      const result = await stage.execute({
        jobId: 'test_job_cached',
        videoUrl: 'https://youtube.com/watch?v=123',
        clips,
        sourceDuration: 100,
        words: [],
        generationMode: 'ai',
        db: mockDb,
      });

      expect(result.success).toBe(true);
      expect(result.data?.dbClips.length).toBe(1);
      expect(result.data?.dbClips[0].status).toBe('uploaded');
      expect(result.data?.pendingRenderJobs.length).toBe(0);
    });
  });
});
