import {
  DefaultTelemetryCollector,
  classifyPipelineError,
  ErrorCategory,
  PipelineError,
  buildClipExplainability,
  OverallScorer,
} from '@excerpt/clipping-core';

describe('End-to-End Pipeline Telemetry & Error Integration', () => {
  describe('Stage Telemetry Emissions', () => {
    it('emits structured telemetry for every stage in the pipeline lifecycle', () => {
      const collector = new DefaultTelemetryCollector();

      // 1. Download Stage
      collector.startStage('stage_0_input', { url: 'https://youtube.com/watch?v=test' });
      collector.endStageSuccess('stage_0_input', [{ name: 'input.mp4', sizeBytes: 15400000 }]);

      // 2. Transcription Stage
      collector.startStage('stage_1_transcript');
      collector.endStageSuccess('stage_1_transcript', [{ name: 'transcription.txt', sizeBytes: 2400 }]);

      // 3. Classifier Stage
      collector.startStage('stage_1_5_classifier');
      collector.endStageSuccess('stage_1_5_classifier', undefined, { category: 'podcast', confidence: 0.95 });

      // 4. Candidate Generation Stage
      collector.startStage('stage_3_candidates');
      collector.endStageSuccess('stage_3_candidates', undefined, { candidateCount: 8 });

      // 5. Ranking Stage
      collector.startStage('stage_5_ranking');
      const explainability = buildClipExplainability({
        whySelected: 'Strong hook and visual engagement',
        hookScore: 92,
        emotionScore: 84,
        confidenceScore: 0.91,
      });
      collector.endStageSuccess('stage_5_ranking', undefined, { topClipExplainability: explainability });

      // 6. Subtitle & Crop Planning
      collector.startStage('stage_6_subtitles');
      collector.endStageSuccess('stage_6_subtitles', [{ name: 'subs.ass' }]);

      // 7. Render Execution
      collector.startStage('stage_render');
      collector.endStageSuccess('stage_render', [{ name: 'clip-1.mp4', sizeBytes: 5400000 }]);

      // 8. Upload
      collector.startStage('stage_8_upload');
      collector.endStageSuccess('stage_8_upload', [{ name: 'b2_url', path: 'https://b2.com/clip-1.mp4' }]);

      const history = collector.getHistory();
      expect(history.length).toBe(8);

      for (const stage of history) {
        expect(stage.stage).toBeDefined();
        expect(stage.start).toBeDefined();
        expect(stage.end).toBeDefined();
        expect(typeof stage.durationMs).toBe('number');
        expect(stage.memoryMb?.rss).toBeGreaterThan(0);
        expect(stage.status).toBe('success');
      }
    });

    it('captures stage errors and maps them to canonical taxonomy', () => {
      const collector = new DefaultTelemetryCollector();
      collector.startStage('stage_0_input');

      const downloadErr = new PipelineError({
        message: 'YouTube download blocked (bot detection)',
        category: ErrorCategory.AUTH,
        retryable: false,
        stage: 'download'
      });

      const failedTelemetry = collector.endStageError('stage_0_input', downloadErr);
      expect(failedTelemetry.status).toBe('failed');
      expect(failedTelemetry.error?.category).toBe(ErrorCategory.AUTH);
      expect(failedTelemetry.error?.message).toContain('bot detection');
    });
  });

  describe('Explainability Engine Wiring', () => {
    it('produces complete explainability metadata with ranking factors', () => {
      const explainability = buildClipExplainability({
        whySelected: 'Climax story arc with high emotional intensity',
        hookScore: 88,
        emotionScore: 95,
        motionScore: 78,
        storyScore: 92,
        audioScore: 85,
      });

      expect(explainability.whySelected).toBe('Climax story arc with high emotional intensity');
      expect(explainability.rankingFactors.overallScore).toBe(88);
      expect(explainability.confidenceScore).toBe(0.88);
    });
  });

  describe('Quality Evaluation Suite', () => {
    it('evaluates generated output against benchmark rules', () => {
      const scorer = new OverallScorer();
      const report = scorer.evaluateAll(
        'FootballBenchmark',
        { category: 'sports' },
        { clips: [{ start_time: 12.0, end_time: 35.0 }] },
        {
          candidates: [
            { start_time: 12.0, end_time: 35.0 },
            { start_time: 80.0, end_time: 105.0 },
            { start_time: 150.0, end_time: 175.0 },
            { start_time: 220.0, end_time: 245.0 },
            { start_time: 300.0, end_time: 325.0 },
          ],
          rankedClips: [
            {
              start_time: 12.0,
              end_time: 35.0,
              summary: 'Goal scoring moment',
              virality_score: 95,
              score_breakdown: { hook: 90, emotion: 95 },
            },
          ],
          renderPlans: [{ mode: 'dynamic' }],
          subtitleASS: 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,GOAL!',
        }
      );

      expect(report.passed).toBe(true);
      expect(report.overallScore).toBeGreaterThanOrEqual(85);
    });
  });
});
