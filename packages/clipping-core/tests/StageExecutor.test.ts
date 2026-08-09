import { describe, it, expect, vi } from 'vitest';
import { StageExecutor, ErrorCategory, PipelineError } from '../src';

describe('StageExecutor Framework', () => {
  it('executes successfully and records telemetry', async () => {
    let telemetryReceived: any = null;

    const result = await StageExecutor.run('test-input', {
      stage: 'test_stage',
      component: 'test_component',
      execute: async (input) => `processed_${input}`,
      onTelemetry: (metrics) => {
        telemetryReceived = metrics;
      },
    });

    expect(result).toBe('processed_test-input');
    expect(telemetryReceived).not.toBeNull();
    expect(telemetryReceived.status).toBe('success');
    expect(telemetryReceived.stage).toBe('test_stage');
  });

  it('fails input validation and throws PipelineError', async () => {
    await expect(
      StageExecutor.run('invalid', {
        stage: 'test_stage',
        component: 'test_component',
        validateInput: (input) => input === 'valid',
        execute: async () => 'result',
      })
    ).rejects.toThrow('Stage [test_stage] input validation failed.');
  });

  it('fails output validation and throws PipelineError', async () => {
    await expect(
      StageExecutor.run('test', {
        stage: 'test_stage',
        component: 'test_component',
        execute: async () => 'bad_output',
        validateOutput: (output) => output === 'good_output',
      })
    ).rejects.toThrow('Stage [test_stage] output validation failed contract.');
  });

  it('handles timeouts by throwing PipelineError with TIMEOUT category', async () => {
    await expect(
      StageExecutor.run('test', {
        stage: 'slow_stage',
        component: 'test_component',
        timeoutMs: 50,
        timeoutType: 'api_timeout',
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'done';
        },
      })
    ).rejects.toThrow('Stage [slow_stage] timed out after 50ms');
  });

  it('tracks stage health correctly', async () => {
    await StageExecutor.run('test', {
      stage: 'health_stage',
      component: 'test',
      execute: async () => 'ok',
    });

    const health = StageExecutor.getHealth('health_stage') as any;
    expect(health.status).toBe('healthy');
    expect(health.successRate).toBe(1);
  });
});
