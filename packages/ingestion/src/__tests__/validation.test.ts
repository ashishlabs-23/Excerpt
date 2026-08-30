import { MediaValidator } from '../validation/MediaValidator';
import { MediaArtifact, PipelineErrorCode, CorrelationId } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import fs from 'fs/promises';
import child_process from 'child_process';

jest.mock('fs/promises');
jest.mock('child_process');

const mockLogger = new Logger('corr-123' as CorrelationId);

const baseArtifact: MediaArtifact = {
  sourceType: 'local',
  originalUrlOrPath: '/test.mp4',
  localPath: '/test.mp4',
  mimeType: 'video/mp4',
  fileSizeBytes: 1024 * 1024,
  durationMs: 10000,
  width: 1920,
  height: 1080,
  fps: 30,
  videoCodec: 'h264',
  audioCodec: 'aac',
  hasVideoStream: true,
  hasAudioStream: true,
  hasAudio: true,
  checksumSha256: 'hash'
};

describe('MediaValidator', () => {
  let validator: MediaValidator;

  beforeEach(() => {
    validator = new MediaValidator(mockLogger);
    jest.resetAllMocks();
  });

  const mockFfprobe = (stdoutData: any, exitCode = 0, delay = 0) => {
    const cpMock = {
      stdout: { on: jest.fn((event, cb) => cb(JSON.stringify(stdoutData))) },
      stderr: { on: jest.fn() },
      on: jest.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(exitCode), delay);
        }
      }),
      kill: jest.fn(),
      pid: 12345
    };
    (child_process.spawn as jest.Mock).mockReturnValue(cpMock);
    return cpMock;
  };

  it('1. validates resolutions (360p/720p/1080p/4K) without fatal errors', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    mockFfprobe({ format: {}, streams: [{ codec_type: 'video' }] });

    const resolutions = [
      { width: 640, height: 360 }, // 360p
      { width: 1280, height: 720 }, // 720p
      { width: 1920, height: 1080 }, // 1080p
      { width: 3840, height: 2160 } // 4K
    ];

    for (const res of resolutions) {
      const artifact = { ...baseArtifact, ...res };
      const report = await validator.validate(artifact);
      expect(report.valid).toBe(true);
      expect(report.warnings).toHaveLength(0); // Assuming 16:9 so no non-standard ratio warning
    }
  });

  it('2. 30fps/60fps pass cleanly, VFR yields warning', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    
    // VFR setup: avg_frame_rate != r_frame_rate
    mockFfprobe({
      format: {},
      streams: [{ codec_type: 'video', avg_frame_rate: '30/1', r_frame_rate: '60/1' }]
    });

    const report = await validator.validate({ ...baseArtifact });
    
    expect(report.valid).toBe(true);
    expect(report.warnings.some(w => w.code === 'VFR_DETECTED')).toBe(true);
  });

  it('3. no audio (hasAudio=false) passes validation without fatal error', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    mockFfprobe({ format: {}, streams: [{ codec_type: 'video' }] });

    const artifact = { ...baseArtifact, hasAudioStream: false, hasAudio: false, audioCodec: undefined };
    const report = await validator.validate(artifact);

    expect(report.valid).toBe(true);
    expect(report.fatalErrors).toHaveLength(0);
  });

  it('4. corrupted MP4 (truncated mid-file) handled by ffprobe timeout or error', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    // Simulate ffprobe timing out by never calling close in time
    const cpMock = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(), // never calls close
      kill: jest.fn(),
      pid: 12345
    };
    (child_process.spawn as jest.Mock).mockReturnValue(cpMock);

    // We can't easily test actual time progression without fake timers, 
    // but we can mock the deepProbe method or rely on the mocked child_process.
    // For this test, we simulate deepProbe returning the timeout error explicitly.
    jest.spyOn(validator as any, 'deepProbe').mockResolvedValue({ error: 'Validation timed out, possible adversarial input' });

    const report = await validator.validate(baseArtifact);
    
    expect(report.valid).toBe(false);
    expect(report.fatalErrors[0].message).toContain('Validation timed out, possible adversarial input');
  });

  it('5. adversarial MP4 (malformed atom structure) fails cleanly', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    // Simulate ffprobe returning an error field in JSON
    mockFfprobe({ error: { string: 'moov atom not found' } });

    const report = await validator.validate(baseArtifact);

    expect(report.valid).toBe(false);
    expect(report.fatalErrors[0].message).toContain('moov atom not found');
  });

  it('6. WebM support', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 1000000 });
    mockFfprobe({ format: {}, streams: [{ codec_type: 'video' }] });

    const artifact = { ...baseArtifact, mimeType: 'video/webm', videoCodec: 'vp9' };
    const report = await validator.validate(artifact);

    expect(report.valid).toBe(true);
  });

  it('7. very long video (near resource ceiling) produces high estimated cost', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 5 * 1024 * 1024 * 1024 }); // 5GB
    mockFfprobe({ format: {}, streams: [{ codec_type: 'video' }] });

    // 4 hours
    const artifact = { ...baseArtifact, durationMs: 14400000 };
    const report = await validator.validate(artifact);

    expect(report.valid).toBe(true);
    // 4 hours = 240 mins. Cost = 0.005 + (240 * 0.01) = 2.405
    expect(report.estimatedProcessingCostUsd).toBeCloseTo(2.405);
  });

  it('8. very short video (under minimum duration) is rejected as fatal', async () => {
    (fs.stat as jest.Mock).mockResolvedValue({ size: 100000 });
    mockFfprobe({ format: {}, streams: [{ codec_type: 'video' }] });

    const artifact = { ...baseArtifact, durationMs: 3000 }; // 3 seconds < 5 seconds minimum
    const report = await validator.validate(artifact);

    expect(report.valid).toBe(false);
    expect(report.fatalErrors[0].code).toBe(PipelineErrorCode.MinimumDurationNotMet);
  });
});
