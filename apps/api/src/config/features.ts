export const NEXUS_FEATURES = {
  // Signal Modules (Analysis)
  audio_intelligence: process.env.EXCERPT_NEXUS_AUDIO === 'true' || false,
  face_tracking: process.env.EXCERPT_NEXUS_FACE === 'true' || false,
  visual_activity: process.env.EXCERPT_NEXUS_VISUAL === 'true' || false,
  cinematic_cropping: process.env.EXCERPT_CINEMATIC_CROP !== 'false', // ON by default — Stage 5b
  
  // Enhancement Modules (Generative)
  hook_rewrite: process.env.EXCERPT_NEXUS_HOOK === 'true' || false,
  metadata_generator: process.env.EXCERPT_NEXUS_METADATA === 'true' || false,
  thumbnail_generator: process.env.EXCERPT_NEXUS_THUMBNAIL === 'true' || false,
  
  // Logic & Persistence
  learning_module: process.env.EXCERPT_NEXUS_LEARNING === 'true' || false,
  
  // Scoring Merge Logic
  scoring_merge_enabled: process.env.EXCERPT_NEXUS_SCORE_MERGE === 'true' || false,
  
  // Weights (MUST sum to 1.0)
  weights: {
    original_ai: 0.6,
    modular_signals: 0.4
  },

  ranking_weights: {
    original: 0.45,
    audio: 0.15,
    face: 0.15,
    visual: 0.1,
    hook: 0.15,
  }
};

/**
 * Multi-Modal Intelligence Engine feature flags.
 *
 * Master switch: EXCERPT_MULTIMODAL_ENABLED=true
 * All individual flags are ignored (treated as false) when the master switch is off.
 * This guarantees zero impact on existing jobs until you opt-in.
 *
 * Rollout order:
 *   1. Enable master + classifier → observe logs
 *   2. Enable event_engine         → sports clips improve
 *   3. Enable crowd_engine         → crowd energy boosts rankings
 *   4. Enable commentary_engine    → emotion-driven ranking
 *   5. Enable smart_boundaries     → better clip start/end
 *   6. Enable emotion_thumbnail    → better thumbnails
 *   7. Enable category_ranking     → category-specific scoring
 */
export const MULTIMODAL_FEATURES = {
  /** Master switch — must be true for any sub-feature to activate. */
  enabled: process.env.EXCERPT_MULTIMODAL_ENABLED === 'true',

  /**
   * Stage 1.5 — Content Category Classifier.
   * Classifies video into podcast, football, cricket, etc.
   * Default: ON whenever master is on.
   */
  classifier: process.env.EXCERPT_CLASSIFIER_ENABLED !== 'false',

  /**
   * Stage 2 — Generic Event Engine + Category Adapters.
   * Replaces transcript-only event detection for sports/vlog content.
   */
  event_engine: process.env.EXCERPT_EVENT_ENGINE_ENABLED === 'true',

  /**
   * Stage 4 — Crowd Excitement Engine (FFmpeg audio RMS timeline).
   */
  crowd_engine: process.env.EXCERPT_CROWD_ENGINE_ENABLED === 'true',

  /**
   * Stage 5 — Commentary Emotion Engine (pitch + speaking rate + keywords).
   */
  commentary_engine: process.env.EXCERPT_COMMENTARY_ENGINE_ENABLED === 'true',

  /**
   * Stage 8 — Smart Clip Boundary System (event-aware pre/post roll).
   */
  smart_boundaries: process.env.EXCERPT_SMART_BOUNDARIES_ENABLED === 'true',

  /**
   * Stage 9 — Peak Emotion Thumbnail Selection.
   */
  emotion_thumbnail: process.env.EXCERPT_EMOTION_THUMBNAIL_ENABLED === 'true',

  /**
   * Stage 10 — Category-Specific Ranking Profiles.
   */
  category_ranking: process.env.EXCERPT_CATEGORY_RANKING_ENABLED === 'true',

  /**
   * Skip the slow YUV visual analysis step in the classifier.
   * Set to true on slower machines or when processing time is critical.
   */
  skip_visual_classifier: process.env.EXCERPT_SKIP_VISUAL_CLASSIFIER === 'true',
} as const;

/** Type-safe helper to check if a specific multi-modal feature is active. */
export function isMultiModalEnabled(feature: keyof Omit<typeof MULTIMODAL_FEATURES, 'enabled'>): boolean {
  return MULTIMODAL_FEATURES.enabled && MULTIMODAL_FEATURES[feature];
}

/**
 * Intelligence Orchestrator feature flags.
 *
 * Master switch: EXCERPT_ORCHESTRATOR_ENABLED=true
 * Controls which tiers of the Python intelligence engine pipeline are active.
 *
 * Rollout order:
 *   1. Enable master only       → observe logs, all tiers gated by sub-flags
 *   2. Enable tier_1            → perception engines (YOLO, tracking, speaker)
 *   3. Enable tier_2            → conditional engines (motion, emotion, events)
 *   4. Enable tier_3            → expensive engines (story, critic, reward)
 *   5. Enable merge_results     → feed engine outputs into ranking
 */
export const ORCHESTRATOR_FEATURES = {
  /** Master switch — must be true for any orchestration to run. */
  enabled: process.env.EXCERPT_ORCHESTRATOR_ENABLED === 'true',

  /** Run Tier 1 engines: YOLO, ByteTrack, speaker diarization. */
  tier_1: process.env.EXCERPT_ORCH_TIER1 !== 'false',

  /** Run Tier 2 engines: motion, attention, emotion, events, sports. */
  tier_2: process.env.EXCERPT_ORCH_TIER2 !== 'false',

  /** Run Tier 3 engines: story, editor, critic, reward, virality. */
  tier_3: process.env.EXCERPT_ORCH_TIER3 !== 'false',

  /** Merge orchestrator engine outputs into the clip ranking pipeline. */
  merge_results: process.env.EXCERPT_ORCH_MERGE_RESULTS === 'true',
} as const;

/**
 * Experimental V3 Intelligence Engines
 * Controlled via feature flags to allow A/B testing and disable unstable engines.
 */
export const EXPERIMENTAL_FEATURES = {
  story_engine: process.env.ENABLE_STORY_ENGINE === 'true',
  narrative_engine: process.env.ENABLE_NARRATIVE_ENGINE === 'true',
  boundary_learning: process.env.ENABLE_BOUNDARY_LEARNING === 'true',
  football_intelligence: process.env.ENABLE_FOOTBALL_INTELLIGENCE === 'true',
  v3_engines: process.env.ENABLE_V3_ENGINES === 'true',
} as const;

/** Helper to check if the orchestrator should run. */
export function isOrchestratorEnabled(): boolean {
  return ORCHESTRATOR_FEATURES.enabled;
}

/** Returns the list of active tier numbers based on feature flags. */
export function getActiveTiers(): number[] {
  const tiers: number[] = [];
  if (ORCHESTRATOR_FEATURES.tier_1) tiers.push(1);
  if (ORCHESTRATOR_FEATURES.tier_2) tiers.push(2);
  if (ORCHESTRATOR_FEATURES.tier_3) tiers.push(3);
  return tiers;
}

