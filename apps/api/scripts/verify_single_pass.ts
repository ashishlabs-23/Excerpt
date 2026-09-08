import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import util from 'util';
import { VideoProcessor, getBinaryPath } from '../src/services/videoProcessor';
import { CaptionService } from '../src/services/captionService';

const execFileAsync = util.promisify(execFile);

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

async function verifySinglePass() {
  const processor = new VideoProcessor();
  const captionService = new CaptionService();
  const sourcePath = path.resolve('temp/cache/224480538532/input.mp4');
  const outDir = path.resolve('temp/single_pass_renders');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const words = [
    { word: 'This', start: 0.2, end: 0.6 },
    { word: 'is', start: 0.65, end: 0.9 },
    { word: 'the', start: 0.95, end: 1.2 },
    { word: 'unified', start: 1.25, end: 1.8 },
    { word: 'single-pass', start: 1.85, end: 2.5 },
    { word: 'render', start: 2.55, end: 3.2 },
    { word: 'engine.', start: 3.25, end: 4.5 },
  ];
  const assPath = path.join(outDir, 'single_pass_subs.ass');
  captionService.generateASS(words, assPath, 'submagic');

  console.log('--- Test 1: Full Production (Draft Mode) ---');
  const tDraft = Date.now();
  const draftOut = path.join(outDir, 'single_pass_draft.mp4');
  await processor.renderSinglePassClip({
    inputPath: sourcePath,
    outputPath: draftOut,
    start: 0,
    duration: 5,
    subtitlePath: assPath,
    hookText: 'DRAFT SINGLE-PASS TEST',
    totalDurationSec: 5,
    generationMode: 'draft',
  });
  const draftTimeMs = Date.now() - tDraft;
  const draftProbe = await probeFile(draftOut);
  console.log(`[Draft] Rendered in ${draftTimeMs}ms:`, draftProbe);

  console.log('--- Test 2: Full Production (Quality Mode) ---');
  const tQuality = Date.now();
  const qualityOut = path.join(outDir, 'single_pass_quality.mp4');
  await processor.renderSinglePassClip({
    inputPath: sourcePath,
    outputPath: qualityOut,
    start: 0,
    duration: 5,
    subtitlePath: assPath,
    hookText: 'QUALITY SINGLE-PASS TEST',
    totalDurationSec: 5,
    generationMode: 'quality',
  });
  const qualityTimeMs = Date.now() - tQuality;
  const qualityProbe = await probeFile(qualityOut);
  console.log(`[Quality] Rendered in ${qualityTimeMs}ms:`, qualityProbe);

  console.log('\n--- Comparative Analysis ---');
  console.log(`Draft time: ${draftTimeMs}ms vs Quality time: ${qualityTimeMs}ms`);
  console.log(`Draft bitrate: ${draftProbe.videoBitrate} bps vs Quality bitrate: ${qualityProbe.videoBitrate} bps`);
  console.log(`Draft size: ${fs.statSync(draftOut).size} bytes vs Quality size: ${fs.statSync(qualityOut).size} bytes`);
}

verifySinglePass().catch(err => {
  console.error('[Verification Failed]:', err);
  process.exit(1);
});
