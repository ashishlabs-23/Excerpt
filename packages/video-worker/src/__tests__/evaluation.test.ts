import { MultiAgentOrchestrator } from '../intelligence/evaluation/MultiAgentOrchestrator';
import { EvaluationStore } from '../intelligence/evaluation/EvaluationStore';
import { ClipCandidate, CorrelationId, CandidateConstraints, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import fs from 'fs/promises';
import { AbstractAgent } from '../intelligence/evaluation/Agent';

jest.mock('fs/promises');

describe('Multi-Agent Clip Evaluation', () => {
  let orchestrator: MultiAgentOrchestrator;
  let mockCostLedger: any;
  let mockLogger: Logger;
  let mockStore: EvaluationStore;

  const mockCandidate: ClipCandidate = {
    candidateId: 'cand-123',
    startMs: 10000,
    endMs: 20000,
    durationMs: 10000,
    hook: 0.8,
    storyCompleteness: 0.7,
    speakerContext: 0.9,
    emotion: 0.6,
    visualInterest: 0.5,
    topic: 0.8,
    confidence: 0.8,
    evidence: [],
    boundaryHints: { start: '', end: '' },
    whySelected: []
  };

  const defaultConstraints: CandidateConstraints = {
    minDurationMs: 5000,
    maxDurationMs: 60000,
    acceptanceThreshold: 0.5,
    requestCount: 5
  };

  const mockCorrelationId = 'corr-123' as CorrelationId;

  beforeEach(() => {
    mockLogger = new Logger(mockCorrelationId);
    mockCostLedger = {
      append: jest.fn()
    };
    mockStore = new EvaluationStore('/tmp/evals');
    
    // Default file system mocks
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    
    orchestrator = new MultiAgentOrchestrator(mockLogger, mockCostLedger, mockStore);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('1. budget ceiling triggers fallback scoring, job still completes', async () => {
    // Force CostLedger to throw on the first call (HookAgent)
    mockCostLedger.append.mockImplementation(() => {
      throw new Error('Budget Exceeded');
    });

    const results = await orchestrator.evaluateCandidates([mockCandidate], mockCorrelationId, defaultConstraints);

    expect(results).toHaveLength(1);
    
    const trail = results[0].debateTrail;
    // Fallback should be used for HookAgent
    const hookEval = trail.evaluations.find(e => e.agentName === 'HookAgent');
    expect(hookEval?.fallbackUsed).toBe(true);
    expect(hookEval?.score).toBe(mockCandidate.hook); // Hook uses hook for fallback

    // Job finishes without crashing
    expect(results[0].judgeDecision.fallbackUsed).toBe(true);
  });

  it('2. single agent timeout does not fail candidate evaluation', async () => {
    // Spy on HookAgent to simulate a timeout
    const executeInferenceSpy = jest.spyOn((orchestrator as any).hook as AbstractAgent, 'executeInference' as any);
    executeInferenceSpy.mockRejectedValueOnce(new Error('LLM Timeout'));

    const results = await orchestrator.evaluateCandidates([mockCandidate], mockCorrelationId, defaultConstraints);

    expect(results).toHaveLength(1);
    
    const trail = results[0].debateTrail;
    const hookEval = trail.evaluations.find(e => e.agentName === 'HookAgent');
    
    expect(hookEval?.fallbackUsed).toBe(true);
    expect(hookEval?.reasoning).toContain('Rule-based fallback due to LLM failure: LLM Timeout');

    // StoryAgent succeeds normally
    const storyEval = trail.evaluations.find(e => e.agentName === 'StoryAgent');
    expect(storyEval?.fallbackUsed).toBe(false);
  });

  it('3. JudgeAgent decision + full evidence trail is persisted and re-fetchable', async () => {
    const results = await orchestrator.evaluateCandidates([mockCandidate], mockCorrelationId, defaultConstraints);
    
    // Ensure store.save was called
    expect(fs.writeFile).toHaveBeenCalled();
    const writeArgs = (fs.writeFile as jest.Mock).mock.calls[0];
    
    // Check path format
    expect(writeArgs[0]).toContain(`${mockCorrelationId}_${mockCandidate.candidateId}.json`);
    
    // Check payload includes Judge decision and debate trail
    const payload = JSON.parse(writeArgs[1]);
    expect(payload.judgeDecision).toBeDefined();
    expect(payload.debateTrail).toBeDefined();

    // Re-fetching simulation
    (fs.readFile as jest.Mock).mockResolvedValueOnce(writeArgs[1]);
    const fetched = await mockStore.fetch(mockCorrelationId, mockCandidate.candidateId);
    
    expect(fetched?.correlationId).toBe(mockCorrelationId);
    expect(fetched?.candidateId).toBe(mockCandidate.candidateId);
  });

  it('4. an agent-recommended boundary change outside hard constraints is rejected', async () => {
    // Spy on CriticAgent to recommend a massive boundary shift that reduces duration to 3 seconds
    jest.spyOn((orchestrator as any).critic, 'evaluateDebate').mockResolvedValueOnce({
      agentName: 'CriticAgent',
      score: 0.9,
      confidence: 0.9,
      reasoning: 'Cut 7 seconds off',
      risks: [],
      recommendedChanges: {
        startOffsetMs: 7000, // 10000ms duration -> 3000ms duration
        reason: 'Too long'
      },
      fallbackUsed: false
    });

    const results = await orchestrator.evaluateCandidates([mockCandidate], mockCorrelationId, defaultConstraints);
    
    expect(results).toHaveLength(1);
    
    const judgeDecision = results[0].judgeDecision;
    
    // The orchestrator must strip out the recommendation because 3000ms < 5000ms (minDurationMs)
    expect(judgeDecision.recommendedBoundaryChanges).toBeUndefined();
  });
});
