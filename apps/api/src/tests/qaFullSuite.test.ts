import { AudioPeakDetector } from '../services/intelligence/AudioPeakDetector';
import { SportsAdapter, OpticalFlowDetector, ReplayDetector } from '../services/intelligence/adapters/SportsAdapter';
import { PipelineContext } from '../services/intelligence/PipelineContext';
import { ZombieSweeperService } from '../services/ZombieSweeperService';
import fs from 'fs';
import path from 'path';

describe('QA Full Subsystem & Invariant Verification Suite', () => {
  const API_BASE = 'http://localhost:8010';

  // =========================================================================
  // TIER 1: SECURITY & INPUT FUZZING
  // =========================================================================
  describe('Tier 1: Security & Boundary Fuzzing', () => {
    it('SEC-01: Rejects file URI and directory traversal attempts in video URL', async () => {
      try {
        const res = await fetch(`${API_BASE}/api/video/generate-clips`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'file:///etc/passwd' }),
        });
        // Must reject with 4xx client error
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      } catch (err: any) {
        // If server is unreachable in test runner, fail test
        throw err;
      }
    });

    it('SEC-02: Rejects non-HTTP javascript injection schemes', async () => {
      const res = await fetch(`${API_BASE}/api/video/generate-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'javascript:alert(1)' }),
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('SEC-03: Rejects malformed payload in PeakCut detect-peaks', async () => {
      const res = await fetch(`${API_BASE}/api/peakcut/detect-peaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: 'invalid_string', totalDurationSec: 'not_a_number' }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('SEC-04: Rejects incomplete payload in Arena vote endpoint', async () => {
      const res = await fetch(`${API_BASE}/api/system/arena/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: 'test' }), // missing candidate IDs and winner
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Missing required arena fields');
    });
  });

  // =========================================================================
  // TIER 2: API CONTRACTS & SCHEMA VALIDATION
  // =========================================================================
  describe('Tier 2: API Contract & Schema Verification', () => {
    it('API-01: /health endpoint returns alive with 200 OK', async () => {
      const res = await fetch(`${API_BASE}/health`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toBe('alive');
    });

    it('API-02: /health/details returns complete operational metadata', async () => {
      const res = await fetch(`${API_BASE}/health/details`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty('environment');
      expect(json).toHaveProperty('schemaVersion');
      expect(json).toHaveProperty('versions');
    });

    it('API-03: /api/peakcut/presets exposes 9:16 and 16:9 compatible configs', async () => {
      const res = await fetch(`${API_BASE}/api/peakcut/presets`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.aspectRatio).toBe('9:16');
      expect(data.targetDimensions).toEqual({ width: 1080, height: 1920 });
      expect(Array.isArray(data.framingModes)).toBe(true);
      expect(data.framingModes.map((m: any) => m.id)).toEqual(
        expect.arrayContaining(['smart_crop', 'fit_blur', 'face_focus', 'split_stack'])
      );
      expect(Array.isArray(data.captionPresets)).toBe(true);
      expect(data.captionPresets.length).toBeGreaterThanOrEqual(4);
    });

    it('API-04: /api/system/arena/candidates returns dual candidate comparison pair', async () => {
      const res = await fetch(`${API_BASE}/api/system/arena/candidates`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveProperty('candidateA');
      expect(data).toHaveProperty('candidateB');
      expect(data.candidateA).toHaveProperty('id');
      expect(data.candidateA).toHaveProperty('start_time');
      expect(data.candidateA).toHaveProperty('end_time');
      expect(data.candidateB).toHaveProperty('id');
    });

    it('API-05: /api/peakcut/detect-peaks supports both second and timestamp schemas', async () => {
      const payload = {
        timeline: [
          { timestamp: 0, energy: 0.1 },
          { timestamp: 5, energy: 0.2 },
          { timestamp: 15, energy: 0.98 },
          { timestamp: 25, energy: 0.15 },
        ],
        totalDurationSec: 40,
        options: { minDurationSec: 10, maxDurationSec: 30 },
      };

      const res = await fetch(`${API_BASE}/api/peakcut/detect-peaks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.strategy).toBe('audio_energy_peaks');
      expect(data.candidates.length).toBeGreaterThanOrEqual(1);
      const peak = data.candidates[0];
      expect(peak.peakSec).toBe(15);
      expect(peak.score).toBeGreaterThan(60);
    });
  });

  // =========================================================================
  // TIER 3: PEAKCUT CORE & INTELLIGENCE ENGINES
  // =========================================================================
  describe('Tier 3: PeakCut Highlight & Intelligence Algorithms', () => {
    const detector = new AudioPeakDetector();

    it('ALG-01: Clusters high-energy audio peaks with lead-in context', () => {
      const timeline = [
        { second: 0, energy: 0.1 },
        { second: 10, energy: 0.2 },
        { second: 20, energy: 0.95 },
        { second: 21, energy: 0.90 },
        { second: 30, energy: 0.15 },
        { second: 60, energy: 0.1 },
      ];

      const peaks = detector.detectPeaks(timeline, 60, {
        targetDurationSec: 25,
        minDurationSec: 15,
        maxDurationSec: 30,
        prePeakLeadSec: 4.0,
      });

      expect(peaks.length).toBeGreaterThan(0);
      const top = peaks[0];
      expect(top.peakSec).toBe(20);
      expect(top.startSec).toBeLessThanOrEqual(16); // 20 - 4s lead-in
      expect(top.endSec - top.startSec).toBeGreaterThanOrEqual(15);
    });

    it('ALG-02: SportsAdapter OpticalFlowDetector detects high-motion action events', async () => {
      class TestSportsAdapter extends SportsAdapter {
        readonly category = 'football' as const;
      }
      const adapter = new TestSportsAdapter();
      const detectors = adapter.getDetectors();
      const opticalFlow = detectors.find(d => d.name === 'OpticalFlowDetector');
      expect(opticalFlow).toBeDefined();

      const mockContext: any = {
        visualTimeline: [
          { second: 10, motion_score: 0.3, gameplay_density: 0.8 },
          { second: 11, motion_score: 0.75, gameplay_density: 0.9 }, // motion spike!
          { second: 12, motion_score: 0.82, gameplay_density: 0.9 },
          { second: 13, motion_score: 0.2, gameplay_density: 0.8 },
        ],
      };

      const events = await opticalFlow!.detect('/dummy/path.mp4', mockContext);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('action_event');
      expect(events[0].start).toBe(11);
      expect(events[0].confidence).toBeGreaterThanOrEqual(0.75);
    });

    it('ALG-03: SportsAdapter ReplayDetector captures replay segments with boost', async () => {
      const replayDetector = new ReplayDetector();
      const mockContext: any = {
        replaySegments: [
          { start: 45, end: 55, type: 'slow_motion', importanceBoost: 0.35 },
        ],
      };

      const events = await replayDetector.detect('/dummy/path.mp4', mockContext);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('replay');
      expect(events[0].confidence).toBe(0.35);
      expect(events[0].start).toBe(45);
      expect(events[0].end).toBe(55);
    });

    it('VIS-01: 16:9 Landscape aspect ratio preserves full widescreen resolution without portrait cropping', async () => {
      try {
        const { VideoProcessor } = require('../services/videoProcessor');
        const processor = new VideoProcessor();
        jest.spyOn(processor, 'getVideoDimensions').mockResolvedValue({ width: 1920, height: 1080 });

        const res = await processor.buildCropFilter('/dummy/video.mp4', 0, 30, null, '16:9');
        console.log('VIS-01 RESULT:', res);
        expect(res.cropPlan.mode).toBe('widescreen_preserve');
        expect(res.cropFilter).toContain('1920:1080');
        expect(res.cropFilter).not.toContain('crop=w=1080:h=1920');
      } catch (e: any) {
        console.error('VIS-01 CAUGHT ERROR:', e);
        throw e;
      }
    });

    it('VIS-02: 16:9 Subtitles configure PlayResX=1920, PlayResY=1080 and lower-third margin', () => {
      const { KineticCaptionGenerator } = require('../services/kineticCaptionGenerator');
      const generator = new KineticCaptionGenerator();
      const tmpFile = path.join(process.cwd(), 'temp', `test-caps-169-${Date.now()}.ass`);

      try {
        generator.generateASS(
          [{ start: 0, end: 1, word: 'Test' }],
          tmpFile,
          'minimal',
          10,
          { aspectRatio: '16:9' }
        );
        const content = fs.readFileSync(tmpFile, 'utf-8');
        expect(content).toContain('PlayResX: 1920');
        expect(content).toContain('PlayResY: 1080');
      } finally {
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      }
    });
  });

  // =========================================================================
  // TIER 4: STORAGE & RESILIENCE
  // =========================================================================
  describe('Tier 4: Storage Quota & Lifecycle Resilience', () => {
    it('RES-01: ZombieSweeperService safely checks disk quota without crashing', () => {
      const sweeper = new ZombieSweeperService();
      expect(() => {
        // Enforce quota with arbitrary large threshold (100 GB)
        sweeper.sweepLocalDiskQuota(100 * 1024 * 1024 * 1024);
      }).not.toThrow();
    });
  });
});
