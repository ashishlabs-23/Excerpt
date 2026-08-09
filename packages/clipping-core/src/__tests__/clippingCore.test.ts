import {
  classifyPipelineError,
  ErrorCategory,
  PipelineError,
  DefaultTelemetryCollector,
  buildClipExplainability,
  CandidateGenerator,
  BoundaryEvaluator,
  SubtitleEvaluator,
  DiversityEvaluator,
  RankingEvaluator,
  RenderEvaluator,
  OverallScorer,
} from '../index';

describe('@excerpt/clipping-core Domain Contracts & Engines', () => {
  describe('Error Classification Taxonomy', () => {
    it('classifies rate limit errors correctly', () => {
      const err = new Error('HTTP Error 429: Too Many Requests');
      const classification = classifyPipelineError(err);
      expect(classification.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classification.retryable).toBe(true);
    });

    it('classifies auth errors correctly', () => {
      const err = new Error('Sign in to confirm your age');
      const classification = classifyPipelineError(err);
      expect(classification.category).toBe(ErrorCategory.AUTH);
      expect(classification.retryable).toBe(false);
    });

    it('preserves PipelineError instances', () => {
      const custom = new PipelineError({ message: 'Custom boundary error', category: ErrorCategory.BOUNDARY, retryable: false, stage: 'boundary' });
      const classification = classifyPipelineError(custom);
      expect(classification.category).toBe(ErrorCategory.BOUNDARY);
      expect(classification.summary).toBe('Custom boundary error');
    });
  });

  describe('Structured Telemetry', () => {
    it('records stage start, completion, duration, and memory', () => {
      const collector = new DefaultTelemetryCollector();
      collector.startStage('transcription');
      const result = collector.endStageSuccess('transcription', [{ name: 'transcript.json', sizeBytes: 1024 }]);

      expect(result.stage).toBe('transcription');
      expect(result.status).toBe('success');
      expect(typeof result.durationMs).toBe('number');
      expect(result.artifacts?.[0].name).toBe('transcript.json');
      expect(collector.getHistory().length).toBe(1);
    });
  });

  describe('Explainability Model', () => {
    it('builds clip explainability payload with ranking factors', () => {
      const explainability = buildClipExplainability({
        whySelected: 'High emotion and strong hook',
        hookScore: 90,
        emotionScore: 85,
        confidenceScore: 0.88,
      });

      expect(explainability.whySelected).toBe('High emotion and strong hook');
      expect(explainability.rankingFactors.hookScore).toBe(90);
      expect(explainability.confidenceScore).toBe(0.88);
    });
  });

  describe('Candidate Generator Engine', () => {
    it('generates candidate ranges for a story arc', () => {
      const generator = new CandidateGenerator();
      const story: any = {
        id: 'arc-1',
        title: 'Climax Moment',
        boundaries: { hook_start: 10, climax: 25, resolution: 40 },
        candidate_ranges: [],
      };

      const result = generator.generateCandidates(story);
      expect(result.candidate_ranges.length).toBeGreaterThan(0);
      expect(result.candidate_ranges[0].start).toBe(10);
      expect(result.candidate_ranges[0].end).toBe(40);
    });
  });

  describe('Evaluators & Overall Scorer', () => {
    it('runs OverallScorer across evaluation components', () => {
      const scorer = new OverallScorer();
      const report = scorer.evaluateAll(
        'PodcastFixture',
        { topic: 'AI' },
        { clips: [{ start_time: 10, end_time: 40 }] },
        {
          candidates: [
            { start_time: 10, end_time: 40 },
            { start_time: 100, end_time: 130 },
            { start_time: 200, end_time: 230 },
            { start_time: 300, end_time: 330 },
            { start_time: 400, end_time: 430 },
          ],
          rankedClips: [
            {
              start_time: 10,
              end_time: 40,
              summary: 'Great point',
              virality_score: 92,
              score_breakdown: { hook: 90 },
            },
          ],
          renderPlans: [{ mode: 'dynamic' }],
          subtitleASS: 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Hello world',
        }
      );

      expect(report.benchmark).toBe('PodcastFixture');
      expect(report.overallScore).toBeGreaterThan(0);
      expect(report.components.length).toBe(5);
    });
  });
});
