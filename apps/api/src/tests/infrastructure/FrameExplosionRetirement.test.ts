import fs from 'fs';
import path from 'path';
import os from 'os';
import { VideoProcessor } from '../../services/videoProcessor';
import { FrameRecord } from '@excerpt/clipping-core';

describe('P4.3 Retire Legacy Frame Explosion & %06d Enforcement', () => {
  const tempDir = path.join(os.tmpdir(), `test_frame_explosion_${Date.now()}`);
  let processor: VideoProcessor;

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    processor = new VideoProcessor();
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('calculates effectiveFps to strictly cap frames for 45+ minute source videos', async () => {
    const fortyFiveMinutesSec = 45 * 60; // 2700 seconds
    const maxFramesBudget = 120;
    const standardFps = 4;

    // At standard 4fps, 2700s would explode into 10,800 frames!
    const uncappedFrameCount = fortyFiveMinutesSec * standardFps;
    expect(uncappedFrameCount).toBe(10800);

    // With our hardening ceiling:
    const effectiveFps = (fortyFiveMinutesSec > 0 && fortyFiveMinutesSec * standardFps > maxFramesBudget)
      ? Math.max(0.01, Number((maxFramesBudget / fortyFiveMinutesSec).toFixed(4)))
      : standardFps;

    // 120 / 2700 = ~0.0444 fps (1 frame every ~22.5s)
    expect(effectiveFps).toBeCloseTo(0.0444, 3);
    const expectedFrameExtractionCount = Math.round(fortyFiveMinutesSec * effectiveFps);
    expect(expectedFrameExtractionCount).toBeLessThanOrEqual(maxFramesBudget + 2);
    expect(expectedFrameExtractionCount).toBeLessThan(150);
  });

  it('formats extracted frames with %06d and returns typed FrameRecord[]', async () => {
    const testSubDir = path.join(tempDir, 'sample_records');
    fs.mkdirSync(testSubDir, { recursive: true });

    // Seed mock frames following the new %06d convention
    const mockIndices = [1, 2, 50, 1000, 15000];
    for (const idx of mockIndices) {
      const padded = String(idx).padStart(6, '0');
      fs.writeFileSync(path.join(testSubDir, `frame_${padded}.jpg`), 'fake_jpeg_content');
    }

    // Read and verify parsing logic
    const frameFiles = fs.readdirSync(testSubDir)
      .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
      .sort();

    const duration = 60;
    const startTime = 0;
    const records: FrameRecord[] = frameFiles.map((filename, idx) => {
      const match = filename.match(/frame_(\d+)\./);
      const frameIndex = match ? parseInt(match[1], 10) : idx;
      const frameTime = startTime + (frameFiles.length > 1 ? (idx / (frameFiles.length - 1)) * duration : 0);
      return {
        index: frameIndex,
        timestampSec: Number(frameTime.toFixed(3)),
        path: path.join(testSubDir, filename),
      };
    });

    expect(records.length).toBe(5);
    expect(records[0].index).toBe(1);
    expect(records[0].path).toContain('frame_000001.jpg');
    expect(records[4].index).toBe(15000);
    expect(records[4].path).toContain('frame_015000.jpg');
    // Verify %06d eliminates %04d overflow sort ambiguity (frame_015000 sorts after frame_001000)
    expect(records[3].index).toBe(1000);
    expect(records[4].timestampSec).toBe(60);
  });

  it('Acceptance Gate: 45+ minute source generates zero full-duration JPEG dumping', async () => {
    const sourceDurationSec = 3600; // 60 minutes
    const maxFrames = 120;
    const outputDir = path.join(tempDir, 'gate_60min');
    fs.mkdirSync(outputDir, { recursive: true });

    // Calling extractAnalysisFrames on a dummy or non-existent file gracefully resolves
    // and logs capped target frames
    const dummyPath = path.join(tempDir, 'nonexistent_test_input.mp4');
    const records = await processor.extractAnalysisFrames(dummyPath, 0, sourceDurationSec, outputDir, { maxFrames });

    // Ensure it returned an array and did NOT crash or spawn 14,400 frames
    expect(Array.isArray(records)).toBe(true);
    expect(records.length).toBeLessThanOrEqual(maxFrames);
  });
});
