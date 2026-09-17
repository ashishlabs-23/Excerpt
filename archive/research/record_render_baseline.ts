import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import { VideoProcessor, getBinaryPath } from '../src/services/videoProcessor';
import { CaptionService } from '../src/services/captionService';

const execFileAsync = util.promisify(execFile);

interface BaselineResult {
  scenario: string;
  passes: number;
  wallClockMs: number;
  fileSizeBytes: number;
  intermediateDiskBytes: number;
  probe: {
    duration: number;
    width: number;
    height: number;
    videoCodec: string;
    audioCodec: string;
    videoBitrate: number;
    audioBitrate: number;
    fps: string;
  };
}

async function probeFile(filePath: string) {
  const ffprobeBin = getBinaryPath('ffprobe');
  const { stdout } = await execFileAsync(ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,r_frame_rate,bit_rate',
    '-of', 'json',
    filePath
  ]);
  const parsed = JSON.parse(stdout);
  const vStream = parsed.streams?.find((s: any) => s.codec_type === 'video') || {};
  const aStream = parsed.streams?.find((s: any) => s.codec_type === 'audio') || {};

  return {
    duration: Number(parsed.format?.duration || 0),
    width: vStream.width || 0,
    height: vStream.height || 0,
    videoCodec: vStream.codec_name || 'unknown',
    audioCodec: aStream.codec_name || 'unknown',
    videoBitrate: Number(vStream.bit_rate || parsed.format?.bit_rate || 0),
    audioBitrate: Number(aStream.bit_rate || 0),
    fps: vStream.r_frame_rate || 'unknown',
  };
}

async function runBaseline() {
  const processor = new VideoProcessor();
  const captionService = new CaptionService();
  const sourcePath = path.resolve('temp/cache/224480538532/input.mp4');
  const outDir = path.resolve('temp/baseline_renders');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const results: Record<string, BaselineResult> = {};

  const words = [
    { word: 'This', start: 0.2, end: 0.6 },
    { word: 'is', start: 0.65, end: 0.9 },
    { word: 'the', start: 0.95, end: 1.2 },
    { word: 'legacy', start: 1.25, end: 1.8 },
    { word: 'multi-pass', start: 1.85, end: 2.5 },
    { word: 'baseline', start: 2.55, end: 3.2 },
    { word: 'benchmark', start: 3.25, end: 4.0 },
    { word: 'recording.', start: 4.05, end: 5.0 },
  ];

  // 1. Basic Crop Only (1 pass)
  {
    console.log('[Baseline] Running Scenario 1: Crop Only...');
    const t0 = Date.now();
    const out = path.join(outDir, 'legacy_crop_only.mp4');
    await processor.processClip(sourcePath, out, 0, 5, undefined, undefined);
    const wallMs = Date.now() - t0;
    const stat = fs.statSync(out);
    const probe = await probeFile(out);
    results['crop_only'] = {
      scenario: 'Crop Only',
      passes: 1,
      wallClockMs: wallMs,
      fileSizeBytes: stat.size,
      intermediateDiskBytes: 0,
      probe,
    };
  }

  // 2. Crop + Captions (2 passes)
  {
    console.log('[Baseline] Running Scenario 2: Crop + Captions (Multi-Pass)...');
    const t0 = Date.now();
    const intermediate = path.join(outDir, 'legacy_caps_clean.mp4');
    const finalOut = path.join(outDir, 'legacy_crop_and_captions.mp4');
    const assPath = path.join(outDir, 'legacy_subs.ass');

    captionService.generateASS(words, assPath, 'submagic');
    await processor.processClip(sourcePath, intermediate, 0, 5, undefined, undefined);
    await processor.exportCustomClip(intermediate, finalOut, { subtitlePath: assPath });

    const wallMs = Date.now() - t0;
    const interSize = fs.statSync(intermediate).size;
    const stat = fs.statSync(finalOut);
    const probe = await probeFile(finalOut);
    results['crop_and_captions'] = {
      scenario: 'Crop + Captions',
      passes: 2,
      wallClockMs: wallMs,
      fileSizeBytes: stat.size,
      intermediateDiskBytes: interSize,
      probe,
    };
  }

  // 3. Full Production Render: Crop + Captions + Hook Card + Progress Bar (3 passes)
  {
    console.log('[Baseline] Running Scenario 3: Full Production Render (3 passes)...');
    const t0 = Date.now();
    const cleanOut = path.join(outDir, 'legacy_prod_clean.mp4');
    const captionedOut = path.join(outDir, 'legacy_prod_captioned.mp4');
    const finalOut = path.join(outDir, 'legacy_prod_full.mp4');
    const assPath = path.join(outDir, 'legacy_prod_subs.ass');

    captionService.generateASS(words, assPath, 'submagic');
    // Pass 1: crop
    await processor.processClip(sourcePath, cleanOut, 0, 5, undefined, undefined);
    // Pass 2: captions
    await processor.exportCustomClip(cleanOut, captionedOut, { subtitlePath: assPath });
    // Pass 3: hook card and progress bar
    await processor.addHookAndProgressBar(captionedOut, finalOut, 'THE ULTIMATE PODCAST HOOK', 5);

    const wallMs = Date.now() - t0;
    const interSize = fs.statSync(cleanOut).size + fs.statSync(captionedOut).size;
    const stat = fs.statSync(finalOut);
    const probe = await probeFile(finalOut);
    results['full_production'] = {
      scenario: 'Full Production Render (Multi-Pass)',
      passes: 3,
      wallClockMs: wallMs,
      fileSizeBytes: stat.size,
      intermediateDiskBytes: interSize,
      probe,
    };
  }

  const reportPath = path.resolve('temp/render_baseline_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`[Baseline] Complete! Results saved to ${reportPath}`);
}

runBaseline().catch(err => {
  console.error('[Baseline] Failed:', err);
  process.exit(1);
});
