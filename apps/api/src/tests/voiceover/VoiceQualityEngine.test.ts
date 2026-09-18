import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { VoiceQualityEngine } from '../../services/VoiceQualityEngine';
import { getBinaryPath } from '../../services/videoProcessor';

const ffmpegBin = getBinaryPath('ffmpeg');

function runCmd(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${bin} ${args.join(' ')}\n${stderr || err.message}`));
      else resolve(stdout + '\n' + stderr);
    });
  });
}

describe('VoiceQualityEngine Subsystem', () => {
  const engine = VoiceQualityEngine.getInstance();
  const testDir = path.resolve(process.cwd(), 'temp', 'vqe_test');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('correctly scores balanced, high-quality synthesized speech audio', async () => {
    const audioPath = path.join(testDir, 'clean_audio.wav');
    // Generate 3-second audio at -16 dBFS
    await runCmd(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=3',
      '-af', 'volume=-16dB',
      '-c:a', 'pcm_s16le',
      audioPath,
    ]);

    const report = await engine.analyze(
      audioPath,
      'This is a clean, well paced narration segment for excerpt.'
    );

    expect(report.passed).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(70);
    expect(report.metrics.durationMs).toBeGreaterThan(2500);
    expect(report.metrics.peakDbFS).toBeLessThan(-5);
  });

  it('detects audio clipping when volume exceeds -1 dBFS', async () => {
    const clippingPath = path.join(testDir, 'clipping_audio.wav');
    // Generate 2-second full-scale 1.0 amplitude square/sine wave
    await runCmd(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', 'aevalsrc=sin(2*PI*440*t):s=48000:d=2',
      '-c:a', 'pcm_s16le',
      clippingPath,
    ]);

    const report = await engine.analyze(clippingPath, 'Loud clipping test audio.');

    expect(report.metrics.peakDbFS).toBeGreaterThanOrEqual(-1.0);
    const hasClippingIssue = report.issues.some(i => i.type === 'clipping');
    expect(hasClippingIssue).toBe(true);
  });

  it('detects low energy when mean audio level is below -30 dBFS', async () => {
    const quietPath = path.join(testDir, 'quiet_audio.wav');
    // Generate 2-second audio at -45 dBFS
    await runCmd(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
      '-af', 'volume=-45dB',
      '-c:a', 'pcm_s16le',
      quietPath,
    ]);

    const report = await engine.analyze(quietPath, 'Very quiet audio test.');

    expect(report.metrics.meanDbFS).toBeLessThan(-30);
    const hasLowEnergyIssue = report.issues.some(i => i.type === 'low_energy');
    expect(hasLowEnergyIssue).toBe(true);
  });
});
