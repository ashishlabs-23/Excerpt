import { DeliveryValidator } from '../delivery/DeliveryValidator';
import { PlaybackValidator, UploadedArtifact } from '../delivery/PlaybackValidator';
import { UploadIntegrity } from '../delivery/UploadIntegrity';
import { Logger } from '@excerpt/shared';

describe('Artifact Delivery and Playback Validation', () => {
  let logger: Logger;
  let playbackValidator: PlaybackValidator;
  let uploadIntegrity: UploadIntegrity;
  let validator: DeliveryValidator;

  beforeEach(() => {
    logger = new Logger('del-1' as any);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    playbackValidator = new PlaybackValidator(logger);
    uploadIntegrity = new UploadIntegrity(logger);
    validator = new DeliveryValidator(logger, playbackValidator, uploadIntegrity);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createArtifact = (id: string, suffix: string = ''): UploadedArtifact => ({
    id,
    localPath: '/tmp/mock.mp4',
    remoteUrl: `https://s3.aws.com/bucket/mock${suffix}.mp4`,
    remoteETag: '"d41d8cd98f00b204e9800998ecf8427e"', // MD5 of empty string (will mock fs later)
    expectedDurationMs: 10000,
    hasAudio: true
  });

  it('1. M=0 of N -> failed:artifact_unusable', async () => {
    jest.spyOn(uploadIntegrity, 'verifyChecksum').mockRejectedValue(new Error('Corruption'));
    
    const artifacts = [createArtifact('1'), createArtifact('2')];
    
    // N=2 planned, M=0 valid
    const result = await validator.finalizeJob(2, artifacts);
    
    expect(result.status).toBe('failed:artifact_unusable');
    expect(result.validArtifacts.length).toBe(0);
    expect(result.report.playable).toBe(0);
  });

  it('2. 0 < M < N -> completed:partial', async () => {
    // 1 succeeds, 1 fails checksum
    jest.spyOn(uploadIntegrity, 'verifyChecksum')
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Corruption'));
    jest.spyOn(playbackValidator, 'validate').mockResolvedValue(true);
    
    const artifacts = [createArtifact('1'), createArtifact('2')];
    
    // N=2 planned, M=1 valid
    const result = await validator.finalizeJob(2, artifacts);
    
    expect(result.status).toBe('completed:partial');
    expect(result.validArtifacts.length).toBe(1);
    expect(result.validArtifacts[0].id).toBe('1');
    expect(result.report.playable).toBe(1);
  });

  it('3. M=N -> completed', async () => {
    jest.spyOn(uploadIntegrity, 'verifyChecksum').mockResolvedValue(true);
    jest.spyOn(playbackValidator, 'validate').mockResolvedValue(true);
    
    const artifacts = [createArtifact('1'), createArtifact('2')];
    
    // N=2 planned, M=2 valid
    const result = await validator.finalizeJob(2, artifacts);
    
    expect(result.status).toBe('completed');
    expect(result.validArtifacts.length).toBe(2);
    expect(result.report.playable).toBe(2);
  });

  it('4. upload checksum mismatch is caught and fails that artifact', async () => {
    const spy = jest.spyOn(uploadIntegrity, 'verifyChecksum').mockRejectedValue(new Error('MD5 mismatch'));
    const result = await validator.finalizeJob(1, [createArtifact('1')]);
    
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed:artifact_unusable');
  });

  it('5. playback validation failing ftyp or 206 fails the artifact', async () => {
    jest.spyOn(uploadIntegrity, 'verifyChecksum').mockResolvedValue(true);
    
    // Real validation method, not mocked, but we feed it a bad URL that triggers the mocked throw
    const badArtifact = createArtifact('1', '-corrupt-header'); // The Mock in the class looks for this string
    
    const result = await validator.finalizeJob(1, [badArtifact]);
    
    expect(result.status).toBe('failed:artifact_unusable');
  });
});
