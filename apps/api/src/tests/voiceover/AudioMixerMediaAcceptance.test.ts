import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { AudioMixer } from '../../services/voiceover/AudioMixer';
import { VoiceoverPlan, buildVoiceoverPlan } from '../../services/voiceover/VoiceoverPlan';
import { VoiceoverService } from '../../services/VoiceoverService';
import { getBinaryPath } from '../../services/videoProcessor';

const ffmpegBin = getBinaryPath('ffmpeg');
const ffprobeBin = getBinaryPath('ffprobe');

function runCmd(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${bin} ${args.join(' ')}\n${stderr || err.message}`));
      else resolve(stdout + '\n' + stderr);
    });
  });
}

async function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    execFile(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], (err, stdout) => {
      if (err || !stdout) resolve(0);
      else resolve(parseFloat(stdout.trim()) || 0);
    });
  });
}

describe('AudioMixer Media Acceptance Benchmark', () => {
  const mixer = AudioMixer.getInstance();
  const testDir = path.resolve(process.cwd(), 'temp', 'audiomixer_acceptance');

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    // Mock VoiceoverService synthesize to produce deterministic local audio
    jest.spyOn(VoiceoverService.prototype, 'synthesize').mockImplementation(
      async (text: string, _config: any, outputDir: string, segmentId: string) => {
        fs.mkdirSync(outputDir, { recursive: true });
        const segAudioPath = path.join(outputDir, `vo_${segmentId}.wav`);
        // Generate a 2.5s sine wave audio segment
        await runCmd(ffmpegBin, [
          '-y',
          '-f', 'lavfi', '-i', 'sine=frequency=500:sample_rate=48000:duration=2.5',
          '-c:a', 'pcm_s16le',
          segAudioPath,
        ]);
        return {
          audioPath: segAudioPath,
          provider: 'elevenlabs',
          durationMs: 2500,
          charsUsed: text.length,
        };
      }
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  it('executes multi-segment VoiceoverPlan, preserves explicit target duration, and applies sidechain ducking', async () => {
    const targetDuration = 10;
    const sourceVideoPath = path.join(testDir, 'source_test.mp4');

    // Create a 10s synthetic 720x1280 test video with a 440Hz background audio track
    await runCmd(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', `testsrc=size=720x1280:rate=30:duration=${targetDuration}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${targetDuration}`,
      '-t', String(targetDuration),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      sourceVideoPath,
    ]);

    const plan: VoiceoverPlan = buildVoiceoverPlan({
      sourceClipId: 'test-clip-10s',
      sourceVideoUrl: sourceVideoPath,
      targetDuration,
      originalAudioPolicy: 'duck',
      captions: {
        enabled: true,
        preset: 'submagic',
        burn: false,
      },
      segments: [
        { id: 'seg-1', startTime: 1.0, endTime: 3.5, text: 'First spoken segment of the test video.' },
        { id: 'seg-2', startTime: 5.0, endTime: 7.5, text: 'Second spoken segment with key takeaways.' },
      ],
    });

    const workDir = path.join(testDir, 'render_run');
    const result = await mixer.executePlan(plan, sourceVideoPath, workDir);

    expect(fs.existsSync(result.outputVideoPath)).toBe(true);
    expect(fs.existsSync(result.outputAudioPath)).toBe(true);
    expect(result.segmentAudios).toHaveLength(2);

    // Verify video duration strictly matches target duration (within 200ms tolerance)
    const actualDuration = await getMediaDuration(result.outputVideoPath);
    expect(Math.abs(actualDuration - targetDuration)).toBeLessThan(0.35);

    // Verify captions were generated
    if (result.captionPath) {
      expect(fs.existsSync(result.captionPath)).toBe(true);
      const assContent = fs.readFileSync(result.captionPath, 'utf8');
      expect(assContent).toContain('[Script Info]');
      expect(assContent).toContain('Dialogue:');
    }
  });

  it('handles mute originalAudioPolicy cleanly without background mixing errors', async () => {
    const targetDuration = 6;
    const sourceVideoPath = path.join(testDir, 'mute_source.mp4');

    await runCmd(ffmpegBin, [
      '-y',
      '-f', 'lavfi', '-i', `testsrc=size=720x1280:rate=30:duration=${targetDuration}`,
      '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${targetDuration}`,
      '-t', String(targetDuration),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      sourceVideoPath,
    ]);

    const plan: VoiceoverPlan = buildVoiceoverPlan({
      sourceClipId: 'test-mute-6s',
      sourceVideoUrl: sourceVideoPath,
      targetDuration,
      originalAudioPolicy: 'mute',
      segments: [
        { id: 'mute-seg-1', startTime: 0.5, endTime: 3.0, text: 'Pure voiceover commentary with original muted.' },
      ],
    });

    const workDir = path.join(testDir, 'mute_run');
    const result = await mixer.executePlan(plan, sourceVideoPath, workDir);

    expect(fs.existsSync(result.outputVideoPath)).toBe(true);
    const actualDuration = await getMediaDuration(result.outputVideoPath);
    expect(Math.abs(actualDuration - targetDuration)).toBeLessThan(0.35);
  });
});
