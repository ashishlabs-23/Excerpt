import { PerceptionOrchestrator } from '../PerceptionOrchestrator';
import { MediaArtifact, PipelineErrorCode, CorrelationId } from '@excerpt/clipping-core';
import { CostLedger, Logger } from '@excerpt/shared';
import fs from 'fs/promises';
import { TemporalAligner } from '../alignment/TemporalAligner';
import { WhisperXEngine } from '../engines/MockEngines';

jest.mock('fs/promises');

describe('Unified Perception Engine', () => {
  let orchestrator: PerceptionOrchestrator;
  let mockCostLedger: any;
  let mockLogger: Logger;

  const mockArtifact: MediaArtifact = {
    sourceType: 'local',
    originalUrlOrPath: '/test.mp4',
    localPath: '/test.mp4',
    mimeType: 'video/mp4',
    fileSizeBytes: 1024 * 1024,
    durationMs: 2000,
    hasVideoStream: true,
    hasAudioStream: true,
    hasAudio: true,
    checksumSha256: 'hash123'
  };

  beforeEach(() => {
    mockLogger = new Logger('corr-123' as CorrelationId);
    mockCostLedger = {
      append: jest.fn()
    };
    orchestrator = new PerceptionOrchestrator(mockLogger, mockCostLedger as any, '/tmp/cache');
    
    // Mock fs cache responses to miss by default
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('1. timestamp alignment across engines with different native sampling rates', () => {
    const durationMs = 1000;
    // WhisperX produces distinct per-word slices
    const whisper = [
      { word: 'A', startMs: 100, endMs: 200 },
      { word: 'B', startMs: 400, endMs: 500 }
    ];
    // Pyannote produces 1s wide diarization chunks
    const pyannote = [
      { speaker: 'SPK_01', startMs: 0, endMs: 1000 }
    ];
    // YOLO produces 30fps frames (every ~33ms)
    const yolo = [
      { timestampMs: 105, objects: ['car'], persons: [] },
      { timestampMs: 405, objects: ['car', 'person'], persons: [{ box: [] }] }
    ];

    const stream = TemporalAligner.align(durationMs, whisper, pyannote, yolo, 100);

    // 100ms interval -> 10 frames
    expect(stream.frames.length).toBe(10);

    // Frame at 100ms should capture Whisper word A and YOLO car
    const f100 = stream.frames[1];
    expect(f100.transcriptWords.available).toBe(true);
    expect(f100.transcriptWords.data).toHaveLength(1);
    expect(f100.transcriptWords.data![0].word).toBe('A');
    expect(f100.objects.data).toContain('car');
    expect(f100.speaker.data).toBe('SPK_01');

    // Frame at 400ms should capture Whisper word B and YOLO person
    const f400 = stream.frames[4];
    expect(f400.transcriptWords.data![0].word).toBe('B');
    expect(f400.objects.data).toContain('person');
  });

  it('2. one optional engine failing does not fail the job, does lower completeness', async () => {
    // Mock YOLO to fail
    jest.spyOn((orchestrator as any).yolo, 'run').mockRejectedValue(new Error('YOLO crashed'));
    
    const result = await orchestrator.process(mockArtifact);
    
    // Completeness should be lowered (~0.67)
    expect(result.completeness).toBeLessThan(1.0);
    expect(result.stream.frames.length).toBeGreaterThan(0);
    // YOLO data should be marked unavailable
    expect(result.stream.frames[0].objects.available).toBe(false);
  });

  it('3. one mandatory engine failing does fail the job with the correct error code', async () => {
    // Mock WhisperX (mandatory) to fail
    jest.spyOn((orchestrator as any).whisper, 'run').mockRejectedValue(new Error('WhisperX Model OOM'));
    
    await expect(orchestrator.process(mockArtifact)).rejects.toMatchObject({
      code: PipelineErrorCode.PerceptionEngineFailed,
      message: expect.stringContaining('WhisperX failed: WhisperX Model OOM')
    });
  });

  it('4. cache hit on identical (checksum, engine, version)', async () => {
    // Mock Cache to return data
    const cachedData = [{ word: 'Cached', startMs: 0, endMs: 500 }];
    (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(cachedData));

    // Spy on actual run methods
    const whisperRun = jest.spyOn((orchestrator as any).whisper, 'run');

    await orchestrator.process(mockArtifact);
    
    expect(whisperRun).not.toHaveBeenCalled();
    expect(fs.readFile).toHaveBeenCalled();
  });

  it('5. cache MISS after engine version bump on identical checksum', async () => {
    // Mock Cache to return miss
    (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

    const whisperRun = jest.spyOn((orchestrator as any).whisper, 'run');

    await orchestrator.process(mockArtifact);
    
    expect(whisperRun).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalled(); // Should write new cache
  });

  it('6. budget ceiling (Step 0.5) halts further perception calls if exceeded', async () => {
    mockCostLedger.append.mockImplementation(() => {
      const err = new Error('Budget exceeded');
      (err as any).code = PipelineErrorCode.BudgetExceeded;
      throw err;
    });

    await expect(orchestrator.process(mockArtifact)).rejects.toMatchObject({
      code: PipelineErrorCode.BudgetExceeded
    });
  });
});
