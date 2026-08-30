import { CircuitBreaker } from '../recovery/CircuitBreaker';
import { StageDispatcher, JobContext } from '../recovery/StageDispatcher';
import { DeadLetterAlerting } from '../recovery/DeadLetterAlerting';
import { Logger } from '@excerpt/shared';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

describe('Pipeline Failure and Recovery Engine', () => {
  let logger: Logger;
  let dispatcher: StageDispatcher;
  let dlq: DeadLetterAlerting;

  beforeEach(() => {
    logger = new Logger('rec-1' as any);
    jest.spyOn(logger, 'info').mockImplementation(() => {});
    jest.spyOn(logger, 'warn').mockImplementation(() => {});
    jest.spyOn(logger, 'error').mockImplementation(() => {});

    dispatcher = new StageDispatcher(logger);
    dlq = new DeadLetterAlerting(logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. retrying after a failure does not re-run already-completed stages (Resumability)', async () => {
    const context: JobContext = {
      jobId: 'job-1',
      artifacts: {
        ingestionPath: '/tmp/ingest.mp4',
        transcriptionPath: '/tmp/transcript.json'
      }
    };

    const ingestionSpy = jest.fn().mockResolvedValue('new-ingest');
    const transcriptionSpy = jest.fn().mockResolvedValue('new-transcript');
    const perceptionSpy = jest.fn().mockResolvedValue('/tmp/new-perception.json');

    // These should instantly skip and return the cached paths
    const res1 = await dispatcher.invokeStage(context, 'INGESTION', 'ingestionPath', ingestionSpy);
    const res2 = await dispatcher.invokeStage(context, 'TRANSCRIPTION', 'transcriptionPath', transcriptionSpy);
    
    // This should execute because perceptionPath is missing
    const res3 = await dispatcher.invokeStage(context, 'PERCEPTION', 'perceptionPath', perceptionSpy);

    expect(ingestionSpy).not.toHaveBeenCalled();
    expect(transcriptionSpy).not.toHaveBeenCalled();
    expect(perceptionSpy).toHaveBeenCalledTimes(1);

    expect(res1).toBe('/tmp/ingest.mp4');
    expect(res2).toBe('/tmp/transcript.json');
    expect(res3).toBe('/tmp/new-perception.json');
  });

  it('2. circuit breaker opens after threshold breaches', async () => {
    const breaker = new CircuitBreaker({ providerName: 'Groq', failureThreshold: 3, cooldownMs: 10000 }, logger);

    // 1
    await breaker.checkCircuit();
    breaker.reportFailure();
    // 2
    await breaker.checkCircuit();
    breaker.reportFailure();
    // 3
    await breaker.checkCircuit();
    breaker.reportFailure();

    // 4 - Should throw OPEN immediately
    try {
      await breaker.checkCircuit();
      fail('Should have thrown CircuitOpen');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineError);
      expect(e.code).toBe(PipelineErrorCode.CircuitOpen);
    }
  });

  it('3. circuit breaker half-opens and recovers after cooldown', async () => {
    jest.useFakeTimers();
    const breaker = new CircuitBreaker({ providerName: 'Whisper', failureThreshold: 1, cooldownMs: 5000 }, logger);

    // Trip it
    breaker.reportFailure();

    try {
      await breaker.checkCircuit();
      fail();
    } catch (e) {
      // OPEN
    }

    // Fast forward past cooldown
    jest.advanceTimersByTime(5001);

    // Call now should NOT throw, it transitions to HALF_OPEN
    await breaker.checkCircuit();

    // If it succeeds now, it recovers
    breaker.reportSuccess();

    // Normal calls resume
    await breaker.checkCircuit();

    jest.useRealTimers();
  });

  it('4. a job exceeding its retry budget lands in dead-letter with an alert fired', async () => {
    const statusUpdateSpy = jest.fn().mockResolvedValue(undefined);
    // Note: typescript allows mocking private methods via any or bracket notation. We'll spy on logger.warn to assert the alert fired.

    const didDLQ = await dlq.handleRetryExhaustion('job-exhausted', 5, 5, statusUpdateSpy);

    expect(didDLQ).toBe(true);
    expect(statusUpdateSpy).toHaveBeenCalledWith('job-exhausted', 'dead_letter');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[ALERT] Fired PagerDuty/Slack webhook'));
  });
});
