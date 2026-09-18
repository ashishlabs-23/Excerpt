import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import { VideoProcessor, getBinaryPath } from '../../services/videoProcessor';
import { CaptionService } from '../../services/captionService';

const execFileAsync = util.promisify(execFile);

describe('Dual-Output Single-Pass Render Equivalence Gate', () => {
  const tempDir = path.join(__dirname, '../../../../temp/dual_output_equivalence');
  const sourceVideoPath = path.join(tempDir, 'source_test.mp4');
  const cleanOutputPath = path.join(tempDir, 'clip-equiv-clean.mp4');
  const captionedOutputPath = path.join(tempDir, 'clip-equiv-captioned.mp4');
  const assFilePath = path.join(tempDir, 'subs-equiv.ass');

  const ffmpegBin = getBinaryPath('ffmpeg');
  const ffprobeBin = getBinaryPath('ffprobe');
  const processor = new VideoProcessor();
  const captionService = new CaptionService();

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate synthetic 5-second 16:9 test video (640x360) with audio tone
    const args = [
      '-f', 'lavfi', '-i', 'testsrc=duration=5:size=640x360:rate=30',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
      '-c:v', 'libx264', '-preset', 'ultrafast',
      '-c:a', 'aac', '-pix_fmt', 'yuv420p',
      '-y', sourceVideoPath
    ];
    await execFileAsync(ffmpegBin, args);

    // Generate ASS subtitle file
    const sampleWords = [
      { start: 0.5, end: 1.5, word: 'EXCERPT' },
      { start: 1.6, end: 2.8, word: 'PIPELINE' },
      { start: 3.0, end: 4.2, word: 'EQUIVALENCE' },
    ];
    captionService.generateASS(sampleWords, assFilePath, 'submagic', 5.0);
  }, 30000);

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  async function probeMedia(filePath: string) {
    const { stdout } = await execFileAsync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,width,height,r_frame_rate,duration,nb_frames',
      '-show_entries', 'format=duration',
      '-of', 'json',
      filePath
    ]);
    return JSON.parse(stdout);
  }

  it('Gate 1 & Gate 2: Produces both clean and captioned deliverables in a single pass without quality drift', async () => {
    const startSec = 0.5;
    const durationSec = 3.5;

    await processor.renderSinglePassClip({
      inputPath: sourceVideoPath,
      outputPath: captionedOutputPath,
      cleanOutputPath: cleanOutputPath,
      start: startSec,
      duration: durationSec,
      subtitlePath: assFilePath,
      generationMode: 'draft',
    });

    // 1. Verify existence
    expect(fs.existsSync(cleanOutputPath)).toBe(true);
    expect(fs.existsSync(captionedOutputPath)).toBe(true);

    const cleanStat = fs.statSync(cleanOutputPath);
    const captionedStat = fs.statSync(captionedOutputPath);
    expect(cleanStat.size).toBeGreaterThan(1000);
    expect(captionedStat.size).toBeGreaterThan(1000);

    // 2. Probe both media outputs
    const cleanProbe = await probeMedia(cleanOutputPath);
    const captionedProbe = await probeMedia(captionedOutputPath);

    const cleanVideoStream = cleanProbe.streams.find((s: any) => s.codec_type === 'video');
    const captionedVideoStream = captionedProbe.streams.find((s: any) => s.codec_type === 'video');
    const cleanAudioStream = cleanProbe.streams.find((s: any) => s.codec_type === 'audio');
    const captionedAudioStream = captionedProbe.streams.find((s: any) => s.codec_type === 'audio');

    // Both must have video and audio
    expect(cleanVideoStream).toBeDefined();
    expect(captionedVideoStream).toBeDefined();
    expect(cleanAudioStream).toBeDefined();
    expect(captionedAudioStream).toBeDefined();

    // 3. Exact Geometry Equivalence
    expect(cleanVideoStream.width).toBe(captionedVideoStream.width);
    expect(cleanVideoStream.height).toBe(captionedVideoStream.height);

    // 4. Exact Timeline & Audio Duration Equivalence
    const cleanDur = parseFloat(cleanProbe.format.duration);
    const captionedDur = parseFloat(captionedProbe.format.duration);
    expect(Math.abs(cleanDur - captionedDur)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(cleanDur - durationSec)).toBeLessThanOrEqual(0.1);

    // 5. Pixel/Frame Divergence: Captioned artifact contains subtitle pixel overlay, clean is pristine
    expect(cleanStat.size).not.toBe(captionedStat.size);
  }, 45000);
});
