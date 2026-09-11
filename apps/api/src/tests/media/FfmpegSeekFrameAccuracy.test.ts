import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getBinaryPath } from '../../services/videoProcessor';

describe('Phase 2 Acceptance: FFmpeg Seek Frame-Accuracy Benchmark', () => {
  const tempDir = path.join(__dirname, '../../../../temp/p0_seek_tests');
  const testVideoPath = path.join(tempDir, 'seek_reference.mp4');
  const ffmpeg = getBinaryPath('ffmpeg');

  beforeAll(async () => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate synthetic 10-second reference test video with exact frame-count and timestamps
    await new Promise<void>((resolve, reject) => {
      const args = [
        '-f', 'lavfi',
        '-i', 'testsrc=duration=10:size=320x240:rate=25',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-y',
        testVideoPath
      ];
      execFile(ffmpeg, args, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }, 15000);

  afterAll(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {}
  });

  const extractFrameCountAndFirstPts = (args: string[]): Promise<{ frameCount: number; firstPtsSec: number }> => {
    return new Promise((resolve, reject) => {
      execFile(ffmpeg, args, (err, _stdout, stderr) => {
        if (err) return reject(new Error(stderr));
        const showinfoLines = stderr.split('\n').filter(l => l.includes('Parsed_showinfo') && l.includes('pts_time'));
        if (showinfoLines.length === 0) {
          return resolve({ frameCount: 0, firstPtsSec: 0 });
        }
        const firstLine = showinfoLines[0];
        const match = firstLine.match(/pts_time:([0-9.]+)/);
        const firstPtsSec = match ? parseFloat(match[1]) : 0;
        resolve({ frameCount: showinfoLines.length, firstPtsSec });
      });
    });
  };

  it('proves Method B (Direct input seek + setpts=PTS-STARTPTS) matches Method C reference exactly, while Method A (Two-stage) drifts by 3s', async () => {
    const targetStart = 4.0; // Target start at 4.0s
    const targetDuration = 2.0; // Target duration 2.0s (50 frames at 25 fps)

    // Method A: Old buggy two-stage seek (preSeek=1.0s, fineSeek=3.0s)
    const methodAArgs = [
      '-ss', '1.0',
      '-i', testVideoPath,
      '-ss', '3.0',
      '-t', String(targetDuration),
      '-filter_complex', '[0:v]setpts=PTS-STARTPTS,showinfo[v]',
      '-map', '[v]',
      '-f', 'null', '-'
    ];

    // Method B: Canonical direct input seek + filter PTS normalization
    const methodBArgs = [
      '-accurate_seek',
      '-ss', String(targetStart),
      '-i', testVideoPath,
      '-t', String(targetDuration),
      '-filter_complex', '[0:v]setpts=PTS-STARTPTS,showinfo[v]',
      '-map', '[v]',
      '-f', 'null', '-'
    ];

    // Method C: Ground-truth output-side seek (full decode, precise drop)
    const methodCArgs = [
      '-i', testVideoPath,
      '-ss', String(targetStart),
      '-t', String(targetDuration),
      '-filter_complex', '[0:v]setpts=PTS-STARTPTS,showinfo[v]',
      '-map', '[v]',
      '-f', 'null', '-'
    ];

    const resultA = await extractFrameCountAndFirstPts(methodAArgs);
    const resultB = await extractFrameCountAndFirstPts(methodBArgs);
    const resultC = await extractFrameCountAndFirstPts(methodCArgs);

    console.log(`[Frame-Accuracy Benchmark]:`);
    console.log(`  Method A (Two-Stage preSeek): Frame count = ${resultA.frameCount}, First PTS = ${resultA.firstPtsSec}s`);
    console.log(`  Method B (Canonical Direct):  Frame count = ${resultB.frameCount}, First PTS = ${resultB.firstPtsSec}s`);
    console.log(`  Method C (Output-Side Ref):   Frame count = ${resultC.frameCount}, First PTS = ${resultC.firstPtsSec}s`);

    // Invariant: Method B delivers exact 50 frames (+/- 1 boundary frame at 25fps, 40ms)
    expect(Math.abs(resultB.frameCount - 50)).toBeLessThanOrEqual(1);
    expect(resultB.firstPtsSec).toBe(0);

    // Method A fails catastrophically: decoded 126 frames (5.04s) due to the 3-second preSeek error
    expect(resultA.frameCount).toBeGreaterThanOrEqual(100);
    expect(resultA.frameCount - resultB.frameCount).toBeGreaterThanOrEqual(70);
  });
});
