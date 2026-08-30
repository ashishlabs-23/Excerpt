import { Logger } from '../logger/logger';
import { CorrelationId, PipelineErrorCode } from '@excerpt/clipping-core';

describe('Logger', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('T6: every log line contains same correlationId', () => {
    const corrId = 'corr-999' as CorrelationId;
    const logger = new Logger(corrId, 'job-abc');

    logger.info('Started');
    logger.debug('Doing work', { stage: 'download', durationMs: 50 });
    logger.error('Failed', { errorCode: PipelineErrorCode.DownloadFailed });

    expect(logSpy).toHaveBeenCalledTimes(3);

    const calls = logSpy.mock.calls;
    
    const entry1 = JSON.parse(calls[0][0]);
    expect(entry1.correlationId).toBe(corrId);
    expect(entry1.level).toBe('info');
    
    const entry2 = JSON.parse(calls[1][0]);
    expect(entry2.correlationId).toBe(corrId);
    expect(entry2.stage).toBe('download');
    
    const entry3 = JSON.parse(calls[2][0]);
    expect(entry3.correlationId).toBe(corrId);
    expect(entry3.errorCode).toBe(PipelineErrorCode.DownloadFailed);
  });
});
