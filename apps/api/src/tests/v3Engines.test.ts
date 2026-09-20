import { createDefaultContext } from '../services/intelligence/PipelineContext';
import { narrativeIntelligenceEngine } from '../services/intelligence/NarrativeIntelligenceEngine';
import { curiosityGapEngine } from '../services/intelligence/CuriosityGapEngine';
import { payoffDetectionEngine } from '../services/intelligence/PayoffDetectionEngine';
import { emotionIntelligenceEngine } from '../services/intelligence/EmotionIntelligenceEngine';
import { retentionPredictionEngine } from '../services/intelligence/RetentionPredictionEngine';
import { viralPatternEngine } from '../services/intelligence/ViralPatternEngine';
import { clipCompletenessEngine } from '../services/intelligence/ClipCompletenessEngine';
import { viewerSatisfactionEngine } from '../services/intelligence/ViewerSatisfactionEngine';
import { universalWowMomentEngineV2 } from '../services/intelligence/UniversalWowMomentEngineV2';

describe('Excerpt V3 Intelligence Engines', () => {
  it('correctly tracks and evaluates narrative setup and story structure', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "I lost my business but then I learned a lesson and won.", start: 0, end: 10 }
    ];

    const result = narrativeIntelligenceEngine.analyze('clip-1', 0, 10, context);
    expect(result.narrative_score).toBeGreaterThan(60);
    expect(result.setup_start).toBe(0);
    expect(result.payoff_start).toBe(8);
  });

  it('measures curiosity gap based on unanswered questions and hook phrases', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "nobody talks about this crazy secret. i found something weird.", start: 0, end: 10 }
    ];

    const result = curiosityGapEngine.analyze('clip-1', 0, 10, context);
    expect(result.curiosity_score).toBeGreaterThan(70);
  });

  it('verifies payoff detection engine and resolves loop rules', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "and that is how the lesson is that you need to focus on what works because it works.", start: 5, end: 10 }
    ];

    const result = payoffDetectionEngine.analyze('clip-1', 0, 10, context);
    expect(result.payoff_strength).toBeGreaterThanOrEqual(60);
  });

  it('identifies dominant emotion and emotional arc intensity', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "This is happy and unbelievable! I feel so proud.", start: 0, end: 10 }
    ];
    context.commentaryEmotions = [
      { timestamp: 5, score: 0.9, level: 'very_excited', pitch_variance: 10, speaking_rate: 140 }
    ];

    const result = emotionIntelligenceEngine.analyze('clip-1', 0, 10, context);
    expect(result.dominant_emotion).toBe('shock');
    expect(result.emotional_intensity).toBeGreaterThan(60);
  });

  it('computes retention prediction based on content category', () => {
    const context = createDefaultContext('test-job');
    context.category.category = 'podcast';
    
    // Seed preceding engines results
    context.narrative = { 'clip-1': { narrative_score: 80 } };
    context.curiosity = { 'clip-1': { curiosity_score: 90 } };
    context.payoff = { 'clip-1': { payoff_strength: 85 } };

    const result = retentionPredictionEngine.predict('clip-1', 0, 10, context);
    expect(result.retention_score).toBeGreaterThan(70);
    expect(result.expected_completion_rate).toBeGreaterThan(70);
  });

  it('classifies viral patterns based on transcript indicators', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "never do this because it is a terrible decision and a massive mistake.", start: 0, end: 10 }
    ];

    const result = viralPatternEngine.classify('clip-1', 0, 10, context);
    expect(result.pattern).toBe('Massive Mistake');
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('verifies clip completeness engine scores', () => {
    const context = createDefaultContext('test-job');
    context.narrative = { 'clip-1': { narrative_score: 80, setup_start: 0, reveal_start: 5 } };
    context.payoff = { 'clip-1': { payoff_strength: 75 } };

    const result = clipCompletenessEngine.analyze('clip-1', 0, 10, context);
    expect(result.completeness_score).toBe(98);
  });

  it('calcules combined viewer satisfaction score correctly', () => {
    const context = createDefaultContext('test-job');
    context.retention = { 'clip-1': { retention_score: 80, expected_completion_rate: 80, expected_rewatch_rate: 80 } };
    context.payoff = { 'clip-1': { payoff_strength: 80 } };
    context.emotionIntelligence = { 'clip-1': { dominant_emotion: 'joy', emotional_intensity: 80, emotion_timeline: [], arc_strength: 80 } };
    context.completeness = { 'clip-1': { completeness_score: 80 } };

    const result = viewerSatisfactionEngine.calculate('clip-1', context);
    expect(result.satisfaction_score).toBe(80);
  });

  it('generates wow moments v2 for sports and creators', () => {
    const context = createDefaultContext('test-job');
    context.category.category = 'football';
    context.events = [
      { type: 'goal', confidence: 0.9, start: 5, end: 7, signals: {}, adapter: 'football' }
    ];

    const result = universalWowMomentEngineV2.generate(context);
    expect(result).toHaveLength(1);
    expect(result[0].wow_type).toBe('achievement');
    expect(result[0].wow_score).toBeGreaterThan(90);
  });

  it('evaluates narrative arc stages and LLM payoff fallback in PayoffDetectionEngine', async () => {
    const stage = payoffDetectionEngine.classifyNarrativeStage('why do people fail? but here is what happened in the end.');
    expect(stage).toBe('resolution');

    const llmResult = await payoffDetectionEngine.analyzePayoffWithLLM(
      'why nobody tells you this secret',
      'and that is how we solved it in the end'
    );
    expect(llmResult.completeness_score).toBeGreaterThanOrEqual(70);
    expect(llmResult.is_promise_delivered).toBe(true);
  });

  it('applies hook x payoff synergy and temporal decay in RetentionPredictionEngine', () => {
    const context = createDefaultContext('test-job');
    context.category.category = 'podcast';
    context.curiosity = { 'clip-synergy': { curiosity_score: 85 } };
    context.payoff = { 'clip-synergy': { payoff_strength: 85 } };
    context.narrative = { 'clip-synergy': { narrative_score: 85 } };
    context.emotionIntelligence = {
      'clip-synergy': {
        dominant_emotion: 'shock',
        emotional_intensity: 80,
        emotion_timeline: [
          { timestamp: 1, emotion: 'shock', intensity: 80 },
          { timestamp: 8, emotion: 'joy', intensity: 90 }
        ],
        arc_strength: 85
      }
    };

    const result = retentionPredictionEngine.predict('clip-synergy', 0, 10, context);
    expect(result.retention_score).toBeGreaterThan(80);
    expect(result.expected_completion_rate).toBeGreaterThan(75);
  });

  it('matches viral patterns using synonym rings and archetype vectors', () => {
    const context = createDefaultContext('test-job');
    context.transcriptSegments = [
      { text: "this changed my life and was a complete glow up from zero to hero", start: 0, end: 10 }
    ];

    const result = viralPatternEngine.classify('clip-synonym', 0, 10, context);
    expect(result.pattern).toBe('Transformation Story');
    expect(result.confidence).toBeGreaterThan(50);
  });

  it('extracts motion saliency and clusters in SaliencyEngine', () => {
    const { saliencyEngine } = require('../services/intelligence/SaliencyEngine');
    const mockTracks = [
      {
        id: 1,
        type: 'ball',
        bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
        confidence: 0.9,
        velocity: { x: 25, y: 30 },
        acceleration: { x: 10, y: 15 },
        age: 10,
        lostFrames: 0,
        occluded: false
      },
      {
        id: 2,
        type: 'person',
        bbox: { x: 0.4, y: 0.4, w: 0.3, h: 0.5 },
        confidence: 0.85,
        velocity: { x: 2, y: 1 },
        acceleration: { x: 0, y: 0 },
        age: 50,
        lostFrames: 0,
        occluded: false
      },
      {
        id: 3,
        type: 'scoreboard',
        bbox: { x: 0.7, y: 0.1, w: 0.2, h: 0.1 },
        confidence: 0.95,
        velocity: { x: 0, y: 0 },
        acceleration: { x: 0, y: 0 },
        age: 100,
        lostFrames: 0,
        occluded: false
      }
    ];

    const ocrData = [{ id: 'title', bbox: { x: 0.1, y: 0.8, w: 0.8, h: 0.1 }, confidence: 0.9 }];
    const heatmapData = [{ id: 'fx', bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, intensity: 0.8 }];

    const regions = saliencyEngine.fuseSaliency(mockTracks, ocrData, heatmapData);
    expect(regions.length).toBeGreaterThanOrEqual(4); // OCR + Hotspot + Motion + Cluster
    expect(regions.some((r: any) => r.type === 'ocr')).toBe(true);
    expect(regions.some((r: any) => r.type === 'saliency_hotspot')).toBe(true);
    expect(regions.some((r: any) => r.id === 'cluster_composite')).toBe(true);
  });
});
