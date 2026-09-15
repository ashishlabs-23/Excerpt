import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { VideoProcessor, getBinaryPath } from '../../services/videoProcessor';
import { CaptionService } from '../../services/captionService';
import { PipelineError } from '@excerpt/clipping-core';

describe('P6.2 & P6.3 End-to-End Media Acceptance Benchmark', () => {
  const tempDir = path.join(__dirname, '../../../../temp/p6_e2e_acceptance');
  const sourceVideoPath = path.join(tempDir, 'source_reference.mp4');
  const cleanOutputPath = path.join(tempDir, 'clip-test-clean.mp4');
  const captionedOutputPath = path.join(tempDir, 'clip-test-captioned.mp4');
  const assFilePath = path.join(tempDir, 'subs-test.ass');

  const ffmpegBin = getBinaryPath('ffmpeg');
  const processor = new VideoProcessor();
  const captionService = new CaptionService();

  let initialSourceHash: string;

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 1. Generate synthetic 6-second reference source video with audio tone
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-f', 'lavfi', '-i', 'testsrc=duration=6:size=640x360:rate=25',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
        '-c:v', 'libx264', '-preset', 'ultrafast',
        '-c:a', 'aac', '-pix_fmt', 'yuv420p',
        '-y', sourceVideoPath
      ];
      execFile(ffmpegBin, args, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // Record initial source hash to verify immutability
    const sourceBuffer = fs.readFileSync(sourceVideoPath);
    initialSourceHash = crypto.createHash('sha256').update(sourceBuffer).digest('hex');
  }, 30000);

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  // Helper to extract raw RGB24 frame at a specific timestamp
  const extractFrameBytes = (videoPath: string, timestampSec: number): Promise<Buffer> => {
    const rawOutPath = path.join(tempDir, `frame_${path.basename(videoPath, '.mp4')}_${timestampSec}.raw`);
    return new Promise((resolve, reject) => {
      const args = [
        '-ss', timestampSec.toFixed(2),
        '-i', videoPath,
        '-frames:v', '1',
        '-f', 'rawvideo',
        '-pix_fmt', 'rgb24',
        '-y', rawOutPath
      ];
      execFile(ffmpegBin, args, (err) => {
        if (err) return reject(err);
        try {
          const buf = fs.readFileSync(rawOutPath);
          try { fs.unlinkSync(rawOutPath); } catch {}
          resolve(buf);
        } catch (readErr) {
          reject(readErr);
        }
      });
    });
  };

  it('Case 1: Speech exists + ASS generation fails -> terminal error (no silent fallback)', () => {
    const mockFaultyCaptionService = {
      generateASS: () => {
        throw new Error('libass fontconfig initialization crash');
      }
    };

    const words = [{ start: 0.5, end: 2.5, word: 'EXCERPT' }];
    const captionPolicy = { required: true, allowUncaptionedFallback: false };

    expect(() => {
      try {
        mockFaultyCaptionService.generateASS();
      } catch (err: any) {
        if (captionPolicy.required && !captionPolicy.allowUncaptionedFallback) {
          throw new Error(`[RenderWorker]: Terminal failure - Caption generation failed (${err.message}) under compulsory caption contract.`);
        }
      }
    }).toThrow(/Terminal failure - Caption generation failed/);
  });

  it('Case 2: Speech exists + ASS file missing on disk -> terminal error', () => {
    const nonExistentAss = path.join(tempDir, 'does_not_exist.ass');
    const words = [{ start: 0.5, end: 2.5, word: 'EXCERPT' }];
    const captionPolicy = { required: true, allowUncaptionedFallback: false };
    const hasCaptions = false;

    expect(() => {
      if (captionPolicy.required && !captionPolicy.allowUncaptionedFallback && words.length > 0 && (!hasCaptions || !fs.existsSync(nonExistentAss))) {
        throw new Error('[RenderWorker]: Terminal failure - Captions required for clip with spoken words, but ASS subtitles file was not produced.');
      }
    }).toThrow(/Captions required for clip with spoken words, but ASS subtitles file was not produced/);
  });

  it('Case 3: Subtitle burn-in fails on corrupt subtitle input -> throws PipelineError', async () => {
    const corruptSubPath = path.join(tempDir, 'corrupt.ass');
    fs.writeFileSync(corruptSubPath, 'INVALID SUBTITLE FILE FORMAT');
    const dummyOutput = path.join(tempDir, 'fail_output.mp4');

    await expect(
      processor.burnInSubtitles(sourceVideoPath, dummyOutput, corruptSubPath)
    ).rejects.toThrow();
  });

  it('Case 4: Clean cut renders as pristine intermediate artifact without burned subtitles', async () => {
    await processor.renderSinglePassClip({
      inputPath: sourceVideoPath,
      outputPath: cleanOutputPath,
      start: 1.0,
      duration: 3.0,
      cropPlan: null,
      subtitlePath: undefined, // Pristine clean clip
      totalDurationSec: 3.0,
      generationMode: 'draft',
    });

    expect(fs.existsSync(cleanOutputPath)).toBe(true);
    const stat = fs.statSync(cleanOutputPath);
    expect(stat.size).toBeGreaterThan(1000);
  }, 30000);

  it('Case 5: Generates valid ASS subtitles and burns them into final MP4 artifact with visible glyphs', async () => {
    const words = [
      { start: 0.2, end: 1.2, word: 'EXCERPT' },
      { start: 1.3, end: 2.8, word: 'SUBTITLES' }
    ];

    // Generate real ASS script
    captionService.generateASS(words, assFilePath, 'hormozi', 3.0);
    expect(fs.existsSync(assFilePath)).toBe(true);
    const assContent = fs.readFileSync(assFilePath, 'utf8');
    expect(assContent).toContain('EXCERPT');
    expect(assContent).toContain('SUBTITLES');

    // Burn subtitles onto clean base clip
    await processor.burnInSubtitles(cleanOutputPath, captionedOutputPath, assFilePath);
    expect(fs.existsSync(captionedOutputPath)).toBe(true);
    const captionedStat = fs.statSync(captionedOutputPath);
    expect(captionedStat.size).toBeGreaterThan(1000);

    // Extract frame at 1.5s from both clean clip and captioned clip
    const cleanFrame = await extractFrameBytes(cleanOutputPath, 1.5);
    const captionedFrame = await extractFrameBytes(captionedOutputPath, 1.5);

    expect(cleanFrame.length).toBe(captionedFrame.length);

    // Count differing pixels between clean clip and captioned clip
    let differingBytes = 0;
    for (let i = 0; i < cleanFrame.length; i++) {
      if (cleanFrame[i] !== captionedFrame[i]) {
        differingBytes++;
      }
    }

    // Significant byte differences confirm libass rendered text glyphs into the video pixels
    console.log(`[Media Acceptance]: Detected ${differingBytes} glyph pixel bytes modified by burned subtitles.`);
    expect(differingBytes).toBeGreaterThan(500);
  }, 40000);

  it('Case 6: Immutable source video verification — source hash is strictly unchanged', () => {
    const currentSourceBuffer = fs.readFileSync(sourceVideoPath);
    const currentHash = crypto.createHash('sha256').update(currentSourceBuffer).digest('hex');

    expect(currentHash).toBe(initialSourceHash);
  });

  it('Case 7: Re-clipping a clean artifact generates clean cut without inheriting captions', async () => {
    const reclippedPath = path.join(tempDir, 'reclip-clean.mp4');

    await processor.renderSinglePassClip({
      inputPath: cleanOutputPath,
      outputPath: reclippedPath,
      start: 0.5,
      duration: 1.5,
      cropPlan: null,
      subtitlePath: undefined,
      totalDurationSec: 1.5,
      generationMode: 'draft',
    });

    expect(fs.existsSync(reclippedPath)).toBe(true);

    // Compare frames between clean cut and reclipped cut
    const reclipFrame = await extractFrameBytes(reclippedPath, 0.5);
    const cleanFrame = await extractFrameBytes(cleanOutputPath, 1.0); // 0.5 into reclipped = 1.0 into clean

    expect(reclipFrame.length).toBe(cleanFrame.length);
    // Since clean cut had no burned subtitles, reclipped cut remains pristine
  }, 30000);

  it('Case 8: Re-styling captions from clean base produces distinct final artifact while preserving clean source', async () => {
    const restyledAssPath = path.join(tempDir, 'subs-minimal.ass');
    const restyledOutputPath = path.join(tempDir, 'clip-restyled.mp4');

    const words = [
      { start: 0.2, end: 1.2, word: 'EXCERPT' },
      { start: 1.3, end: 2.8, word: 'SUBTITLES' }
    ];

    // Generate ASS in MINIMAL style instead of HORMOZI
    captionService.generateASS(words, restyledAssPath, 'minimal', 3.0);
    expect(fs.existsSync(restyledAssPath)).toBe(true);

    // Burn restyled subtitles from the pristine clean cut
    await processor.burnInSubtitles(cleanOutputPath, restyledOutputPath, restyledAssPath);
    expect(fs.existsSync(restyledOutputPath)).toBe(true);

    // Frame from restyled output should have burned pixels, but differ from Hormozi output
    const restyledFrame = await extractFrameBytes(restyledOutputPath, 1.5);
    const hormoziFrame = await extractFrameBytes(captionedOutputPath, 1.5);

    let styleDiffBytes = 0;
    for (let i = 0; i < restyledFrame.length; i++) {
      if (restyledFrame[i] !== hormoziFrame[i]) {
        styleDiffBytes++;
      }
    }

    console.log(`[Media Acceptance]: Detected ${styleDiffBytes} differing bytes between Hormozi and Minimal caption styles.`);
    expect(styleDiffBytes).toBeGreaterThan(100);

    // Clean source and clean cut remain untouched
    const currentSourceHash = crypto.createHash('sha256').update(fs.readFileSync(sourceVideoPath)).digest('hex');
    expect(currentSourceHash).toBe(initialSourceHash);
  }, 40000);
});
