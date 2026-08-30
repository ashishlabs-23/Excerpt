import { getFirestoreDb } from './firebaseService';

export interface DynamicPipelineConfig {
  minCandidateScore: number;
  defaultClipsCount: number;
  hookWeight: number;
  storyWeight: number;
  criticWeight: number;
  maxVideoDurationSeconds: number;
  preferredAspectRatio: string;
  enableLiveAnalysis: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: DynamicPipelineConfig = {
  minCandidateScore: 0.65,
  defaultClipsCount: 3,
  hookWeight: 0.40,
  storyWeight: 0.35,
  criticWeight: 0.25,
  maxVideoDurationSeconds: 1800,
  preferredAspectRatio: '9:16',
  enableLiveAnalysis: true,
};

let cachedConfig: DynamicPipelineConfig = { ...DEFAULT_PIPELINE_CONFIG };
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

export async function getDynamicPipelineConfig(): Promise<DynamicPipelineConfig> {
  const now = Date.now();
  if (now - lastFetchTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const db = getFirestoreDb();
    const doc = await db.collection('system_config').doc('pipeline').get();
    if (doc.exists) {
      cachedConfig = {
        ...DEFAULT_PIPELINE_CONFIG,
        ...doc.data(),
      };
    }
  } catch (err: any) {
    // Fallback gracefully to defaults
  }

  lastFetchTime = now;
  return cachedConfig;
}
