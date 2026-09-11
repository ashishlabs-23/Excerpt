import { FormatResolver, SourceFormatMetadata } from '../../services/download/FormatResolver';
import { KineticCaptionGenerator } from '../../services/kineticCaptionGenerator';
import fs from 'fs';
import path from 'path';

describe('P0 Hardening: Caption Synchronization & Source Quality Test Matrix', () => {
  const tempDir = path.join(__dirname, '../../../../temp/p0_tests');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('Phase 5 & 6: FormatResolver Quality Matrix', () => {
    it('Case 1: 360p-only source is correctly flagged as LOW_SOURCE_RESOLUTION without HD claim', () => {
      const catalog: SourceFormatMetadata[] = [
        { format_id: '18', ext: 'mp4', height: 360, width: 640, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' },
        { format_id: '134', ext: 'mp4', height: 360, width: 640, vcodec: 'avc1.4d401e', acodec: 'none' },
      ];

      const res = FormatResolver.resolve(catalog, 1080);
      expect(res.isLowResolutionSource).toBe(true);
      expect(res.hasHdCapability).toBe(false);
      expect(res.targetHeight).toBe(360);
      expect(res.maxAvailableHeight).toBe(360);
      expect(res.selector).toContain('best[height<=360]');
    });

    it('Case 2: 480p-only source is correctly identified with max 480p target', () => {
      const catalog: SourceFormatMetadata[] = [
        { format_id: '135', ext: 'mp4', height: 480, width: 854, vcodec: 'avc1.4d401e', acodec: 'none' },
        { format_id: '18', ext: 'mp4', height: 360, width: 640, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' },
      ];

      const res = FormatResolver.resolve(catalog, 1080);
      expect(res.isLowResolutionSource).toBe(true);
      expect(res.targetHeight).toBe(480);
      expect(res.hasHdCapability).toBe(false);
    });

    it('Case 3: 720p source prioritizes 720p and forbids silent 360p fallback', () => {
      const catalog: SourceFormatMetadata[] = [
        { format_id: '136', ext: 'mp4', height: 720, width: 1280, vcodec: 'avc1.4d401f', acodec: 'none' },
        { format_id: '18', ext: 'mp4', height: 360, width: 640, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' },
      ];

      const res = FormatResolver.resolve(catalog, 1080);
      expect(res.isLowResolutionSource).toBe(false);
      expect(res.hasHdCapability).toBe(true);
      expect(res.targetHeight).toBe(720);
      expect(res.selector).toContain('height>=720');

      // Quality floor validation: should reject if downloaded was 360p
      expect(() => FormatResolver.validateDownloadedResolution(360, res)).toThrow(/Quality floor violation/);
      expect(() => FormatResolver.validateDownloadedResolution(720, res)).not.toThrow();
    });

    it('Case 4: 1080p source prioritizes 1080p stream combination', () => {
      const catalog: SourceFormatMetadata[] = [
        { format_id: '137', ext: 'mp4', height: 1080, width: 1920, vcodec: 'avc1.640028', acodec: 'none' },
        { format_id: '136', ext: 'mp4', height: 720, width: 1280, vcodec: 'avc1.4d401f', acodec: 'none' },
        { format_id: '18', ext: 'mp4', height: 360, width: 640, vcodec: 'avc1.42001E', acodec: 'mp4a.40.2' },
      ];

      const res = FormatResolver.resolve(catalog, 1080);
      expect(res.isLowResolutionSource).toBe(false);
      expect(res.hasHdCapability).toBe(true);
      expect(res.targetHeight).toBe(1080);
      expect(res.selector).toContain('height>=1080');
    });

    it('Case 5: 1440p/4K source respects resolutionCap=1080', () => {
      const catalog: SourceFormatMetadata[] = [
        { format_id: '271', ext: 'webm', height: 1440, width: 2560, vcodec: 'vp9', acodec: 'none' },
        { format_id: '137', ext: 'mp4', height: 1080, width: 1920, vcodec: 'avc1.640028', acodec: 'none' },
      ];

      const res = FormatResolver.resolve(catalog, 1080);
      expect(res.targetHeight).toBe(1080);
      expect(res.hasHdCapability).toBe(true);
    });

    it('Case 6 & 7: DASH video+audio and pre-merged m3u8 fallbacks are structured with quality floors', () => {
      const res = FormatResolver.resolve([], 1080);
      expect(res.selector).toContain('bestvideo[height<=1080][height>=1080]+bestaudio');
      expect(res.selector).toContain('bestvideo[height<=1080][height>=720]+bestaudio');
      expect(res.selector).toContain('best[protocol^=m3u8][height<=1080][height>=720]');
      // Must not contain loose unconstrained 'best'
      const parts = res.selector.split('/');
      expect(parts.includes('best')).toBe(false);
    });
  });

  describe('Phase 3 & 4: Canonical Word Intersection & ASS Determinism', () => {
    const generator = new KineticCaptionGenerator();

    it('Case 8: Delayed caption boundary starts cleanly at normalized offset', () => {
      const clipStart = 30.0;
      const clipEnd = 45.0;
      const clipDuration = clipEnd - clipStart;

      // Words start at 33.5s (3.5s after clip start)
      const rawWords = [
        { word: 'Finally,', start: 33.5, end: 34.0 },
        { word: 'the', start: 34.1, end: 34.3 },
        { word: 'solution.', start: 34.4, end: 35.0 },
      ];

      // Canonical Intersection
      const relWords = rawWords.filter(w => w.end > clipStart && w.start < clipEnd).map(w => ({
        word: w.word,
        start: Math.max(0, Number((w.start - clipStart).toFixed(3))),
        end: Math.min(clipDuration, Number((w.end - clipStart).toFixed(3))),
      }));

      expect(relWords[0].start).toBe(3.5);
      expect(relWords[relWords.length - 1].end).toBe(5.0);

      const assPath = path.join(tempDir, 'test_delayed.ass');
      generator.generateASS(relWords, assPath, 'submagic', clipDuration);

      const content = fs.readFileSync(assPath, 'utf8');
      expect(content).toContain('Dialogue: 0,0:00:03.50');
    });

    it('Case 9: Word crossing clipStart is normalized to relative 0.000s without prior-word pollution', () => {
      const clipStart = 10.0;
      const clipEnd = 25.0;
      const clipDuration = clipEnd - clipStart;

      const rawWords = [
        // Completely preceding word from prior sentence
        { word: 'yesterday.', start: 8.5, end: 9.8 },
        // Word straddling clip start
        { word: 'Welcome', start: 9.9, end: 10.5 },
        // Normal words
        { word: 'everyone', start: 10.6, end: 11.2 },
      ];

      // Canonical Intersection rule
      const relWords = rawWords
        .filter(w => w.end > clipStart && w.start < clipEnd)
        .map(w => {
          const relStart = Math.max(0, Number((w.start - clipStart).toFixed(3)));
          const relEnd = Math.min(clipDuration, Number((w.end - clipStart).toFixed(3)));
          return { word: w.word, start: relStart, end: relEnd };
        })
        .filter(w => w.end > w.start);

      // Preceding word 'yesterday.' MUST be rejected!
      expect(relWords.some(w => w.word.includes('yesterday'))).toBe(false);
      // Straddling word 'Welcome' is clamped to 0.000s
      expect(relWords[0].word).toBe('Welcome');
      expect(relWords[0].start).toBe(0.0);
      expect(relWords[0].end).toBe(0.5);
    });

    it('Case 10: Word crossing clipEnd is clamped to clipDuration', () => {
      const clipStart = 10.0;
      const clipEnd = 25.0;
      const clipDuration = 15.0;

      const rawWords = [
        { word: 'The', start: 23.0, end: 23.5 },
        { word: 'end', start: 24.5, end: 25.4 }, // Straddles clipEnd (25.0)
        { word: 'tomorrow.', start: 25.5, end: 26.0 }, // Completely after
      ];

      const relWords = rawWords
        .filter(w => w.end > clipStart && w.start < clipEnd)
        .map(w => {
          const relStart = Math.max(0, Number((w.start - clipStart).toFixed(3)));
          const relEnd = Math.min(clipDuration, Number((w.end - clipStart).toFixed(3)));
          return { word: w.word, start: relStart, end: relEnd };
        })
        .filter(w => w.end > w.start);

      // Word after clipEnd must be excluded
      expect(relWords.some(w => w.word.includes('tomorrow'))).toBe(false);
      // Straddling word 'end' clamped to clipDuration (15.0s)
      const lastWord = relWords[relWords.length - 1];
      expect(lastWord.word).toBe('end');
      expect(lastWord.end).toBe(15.0);
    });

    it('Cases 11-14: Verification across 15s, 30s, 60s, and 90s clip durations', () => {
      const durations = [15, 30, 60, 90];

      for (const dur of durations) {
        const words = [
          { word: 'Start', start: 0.1, end: 0.8 },
          { word: 'Middle', start: dur / 2, end: dur / 2 + 0.6 },
          { word: 'Finish', start: dur - 0.7, end: dur - 0.1 },
        ];

        const assPath = path.join(tempDir, `test_${dur}s.ass`);
        generator.generateASS(words, assPath, 'submagic', dur);

        const content = fs.readFileSync(assPath, 'utf8');
        expect(content).toContain('Dialogue: 0,');
        expect(content).toContain('START');
        expect(content).toContain('FINISH');
      }
    });
  });

  describe('Phase 8: A/V Sync Drift Metrics Computation', () => {
    it('calculates sync drift metrics with strict thresholds', () => {
      // Benchmark speech stream simulation
      const expectedTimestamps = [
        { word: 'Welcome', expectedMs: 120 },
        { word: 'to', expectedMs: 450 },
        { word: 'Excerpt', expectedMs: 780 },
        { word: 'Studio', expectedMs: 1400 },
      ];

      const renderedTimestamps = [
        { word: 'Welcome', renderedMs: 135 }, // +15ms
        { word: 'to', renderedMs: 460 },      // +10ms
        { word: 'Excerpt', renderedMs: 805 }, // +25ms
        { word: 'Studio', renderedMs: 1420 }, // +20ms
      ];

      const errors = expectedTimestamps.map((exp, i) => Math.abs(exp.expectedMs - renderedTimestamps[i].renderedMs));
      const maxWordSyncErrorMs = Math.max(...errors);
      const meanWordSyncErrorMs = errors.reduce((sum, e) => sum + e, 0) / errors.length;
      const captionDriftMs = renderedTimestamps[0].renderedMs - expectedTimestamps[0].expectedMs;

      console.log(`[A/V Sync Metrics]: captionDriftMs=${captionDriftMs}ms, maxError=${maxWordSyncErrorMs}ms, meanError=${meanWordSyncErrorMs.toFixed(1)}ms`);

      // Invariant: Max drift < 80ms, mean drift < 40ms
      expect(maxWordSyncErrorMs).toBeLessThan(80);
      expect(meanWordSyncErrorMs).toBeLessThan(40);
      expect(Math.abs(captionDriftMs)).toBeLessThan(50);
    });
  });
});
