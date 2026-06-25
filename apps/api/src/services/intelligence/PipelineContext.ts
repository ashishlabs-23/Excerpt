import { VideoIntelligenceGraph } from './VideoGraph';
import { EventGraph } from './EventGraph';
import { StoryGraph } from './StoryGraph';
import { RankedCandidate } from './PersonaRankingEngine';

/**
 * PipelineContext — typed context object that flows through all intelligence stages.
 * Replaces ad-hoc spreading into debugData.
 *
 * Every new module reads from and writes to this context.
 * The context is serialized into clip metadata for telemetry.
 */

export interface ExperimentContext {
  storyBuilderVersion: string;
  criticVersion: string;
  rankingVersion: string;
  cropVersion: string;
  captionVersion: string;
  rewardVersion: string;
}

export type ContentCategory =
  | 'podcast'
  | 'interview'
  | 'tutorial'
  | 'football'
  | 'cricket'
  | 'basketball'
  | 'mma'
  | 'esports'
  | 'vlog'
  | 'reaction'
  | 'documentary';

export const SPORTS_CATEGORIES: ContentCategory[] = [
  'football',
  'cricket',
  'basketball',
  'mma',
  'esports',
];

export const TALK_CATEGORIES: ContentCategory[] = [
  'podcast',
  'interview',
  'tutorial',
  'documentary',
];

export interface CategoryResult {
  category: ContentCategory;
  confidence: number;         // 0–1
  signals: {
    transcript_signal: string;
    audio_signal: string;
    visual_signal: string;
  };
  fallback_used: boolean;
}

export interface DetectedEvent {
  type: string;               // e.g. 'goal' | 'wicket' | 'knockout' | 'key_insight'
  confidence: number;         // 0–1
  start: number;              // seconds
  end: number;                // seconds
  signals: Record<string, number>;  // raw signal values that fired
  adapter: string;            // which adapter produced this
}

export type SituationType = 'CounterAttack' | 'DangerousAttack' | 'SetPiece' | 'PenaltySequence' | 'VARReview' | 'PressureWave' | 'Turnover' | 'Recovery';

export interface SituationContext {
  minute: number;
  scoreDiff: number;
  matchState: string;
  aggregateScore?: string;
  redCards: number;
  competition?: string;
  isKnockout?: boolean;
  isExtraTime?: boolean;
  isPenaltyShootout?: boolean;
  homeTeam?: string;
  awayTeam?: string;
}

export interface Situation {
  id: string;
  type: SituationType;
  start: number;
  end: number;
  confidence: number;
  relatedEventIds: string[]; // references to the raw events that make up this situation
  context?: SituationContext;
  emotion?: EmotionProfile; // Phase 4/5
  tension?: TensionProfile; // Phase 4/5
  replays?: ReplayProfile; // Phase 8
}

export interface ReplayProfile {
  replayStart: number;
  replayEnd: number;
  replayCount: number;
  replayImportance: number;
}

export type NarrativeType = 
  | 'LateWinner'
  | 'Equalizer'
  | 'Comeback'
  | 'Collapse'
  | 'Heroics'
  | 'Controversy'
  | 'UnderdogMoment'
  | 'RivalryFlashpoint'
  | 'TacticalMasterclass'
  | 'GoalkeeperMasterclass'
  | 'CrowdEruption'
  | 'LastMinuteHeartbreak';

export interface Narrative {
  id: string;
  type: NarrativeType;
  confidence: number;
  narrativeStrength: number;
  publishabilityScore?: number; // Phase 4/5
  situationId: string;
  supportingEventIds: string[];
  supportingSituationIds: string[];
  emotion?: EmotionProfile; // Phase 4/5
  tension?: TensionProfile; // Phase 4/5
}

export interface EmotionProfile {
  crowdEruption: number;
  commentatorExcitement: number;
  playerCelebration: number;
  benchReaction: number;
  managerReaction: number;
  emotionScore: number;
}

export interface TensionProfile {
  startTension: number;
  peakTension: number;
  growthRate: number;
  tensionArea: number;
}

export interface CrowdScore {
  timestamp: number;          // seconds
  score: number;              // 0–100
  label: 'calm' | 'excited' | 'eruption';
}

export interface EmotionPoint {
  timestamp: number;          // seconds
  score: number;              // 0–1
  level: 'calm' | 'excited' | 'very_excited' | 'historic_moment';
  pitch_variance: number;
  speaking_rate: number;
}

export type WowType = 'shock' | 'achievement' | 'celebration' | 'conflict' | 'surprise';

export interface WowMoment {
  wow_type: WowType;
  score: number;              // 0–100
  source_event: DetectedEvent;
  timestamp: number;
}

export interface RankingProfile {
  // Generic signal weights — adapters override per category.
  // All weights should sum to 1.0 (normalized automatically if not).
  transcript?: number;
  hook?: number;
  emotion?: number;
  visual?: number;
  event?: number;
  crowd?: number;
  commentary?: number;
  celebration?: number;
  replay?: number;
  face?: number;
  audio?: number;
}

export interface ReplaySegment {
  start: number;
  end: number;
  type: 'slow_motion' | 'repeated_sequence' | 'graphic_overlay';
  importanceBoost: number;    // e.g. 0.30
}

export interface NarrativeStructure {
  setup_start?: number;
  conflict_start?: number;
  tension_peak?: number;
  reveal_start?: number;
  payoff_start?: number;
  conclusion_start?: number;
  narrative_score: number;      // 0-100
}

export interface CuriosityResult {
  curiosity_score: number;      // 0-100
}

export interface PayoffResult {
  payoff_strength: number;      // 0-100
}

export interface EmotionTimelinePoint {
  timestamp: number;
  emotion: string;
  intensity: number;            // 0-100
}

export interface UnifiedEmotionResult {
  dominant_emotion: string;
  emotional_intensity: number;  // 0-100
  emotion_timeline: EmotionTimelinePoint[];
  arc_strength: number;         // 0-100
}

export interface RetentionPrediction {
  retention_score: number;      // 0-100
  expected_completion_rate: number; // 0-100
  expected_rewatch_rate: number;    // 0-100
}

export interface ViralPatternResult {
  pattern: string;
  confidence: number;           // 0-100
  historical_performance: number; // 0-100
}

export interface CompletenessResult {
  completeness_score: number;   // 0-100
}

export interface ViewerSatisfactionResult {
  satisfaction_score: number;   // 0-100
}

export interface WowMomentV2 {
  wow_type: string;
  wow_score: number;            // 0-100
  wow_reason: string;
  timestamp: number;
}

export interface BroadcastGraphicMetadata {
  detected: boolean;
  confidence: number;
  graphic_type: string;
  gameplay_density: number;
  graphic_penalty: number;
  visual_segment: string;
}

export interface VisualTimelinePoint {
  second: number;
  segment_type: string;
  gameplay_density: number;
  text_density: number;
  motion_score: number;
}

export interface PipelineContext {
  jobId: string;
  experimentContext: ExperimentContext;
  vig?: VideoIntelligenceGraph;
  eventGraph?: EventGraph;
  storyGraph?: StoryGraph;
  rankedCandidates?: RankedCandidate[];

  // Phase 1
  category: CategoryResult;
  transcript?: string;
  transcriptSegments?: any[];
  words?: any[];
  duration?: number;

  // Phase 2–3
  events: DetectedEvent[];
  situations?: Situation[];
  narratives?: Narrative[];
  topNarratives?: Narrative[];

  // Phase 4
  crowdTimeline: CrowdScore[];

  // Phase 5
  commentaryEmotions: EmotionPoint[];

  // Phase 7
  replaySegments: ReplaySegment[];

  // Phase 10
  rankingProfile: RankingProfile;

  // Phase 11 & 24
  wowMoments: WowMoment[];
  wowMomentsV2?: WowMomentV2[];

  // Phase 15
  narrative?: Record<string, NarrativeStructure>; // clipId -> narrative

  // Phase 16
  curiosity?: Record<string, CuriosityResult>;

  // Phase 17
  payoff?: Record<string, PayoffResult>;

  // Phase 18 & 26
  retention?: Record<string, RetentionPrediction>;

  // Phase 19 & 20
  emotionIntelligence?: Record<string, UnifiedEmotionResult>;

  // Phase 21
  viralPatterns?: Record<string, ViralPatternResult>;

  // Phase 22
  completeness?: Record<string, CompletenessResult>;

  // Phase 23
  satisfaction?: Record<string, ViewerSatisfactionResult>;

  // Graphics Intelligence properties (V3.5)
  broadcastGraphics?: Record<string, BroadcastGraphicMetadata>; // clipId -> metadata
  visualTimeline?: VisualTimelinePoint[];

  // Telemetry — execution times per module
  executionTimes: Record<string, number>;
}

/** Factory — produces a neutral default context for the transcript pipeline. */
export function createDefaultContext(jobId: string): PipelineContext {
  return {
    jobId,
    experimentContext: {
      storyBuilderVersion: '1.0',
      criticVersion: '1.0',
      rankingVersion: '1.0',
      cropVersion: '1.0',
      captionVersion: '1.0',
      rewardVersion: '1.0',
    },
    category: {
      category: 'podcast',
      confidence: 1.0,
      signals: {
        transcript_signal: 'default',
        audio_signal: 'default',
        visual_signal: 'default',
      },
      fallback_used: true,
    },
    events: [],
    situations: [],
    narratives: [],
    topNarratives: [],
    crowdTimeline: [],
    commentaryEmotions: [],
    replaySegments: [],
    rankingProfile: {},
    wowMoments: [],
    wowMomentsV2: [],
    narrative: {},
    curiosity: {},
    payoff: {},
    retention: {},
    emotionIntelligence: {},
    viralPatterns: {},
    completeness: {},
    satisfaction: {},
    broadcastGraphics: {},
    visualTimeline: [],
    executionTimes: {},
  };
}
