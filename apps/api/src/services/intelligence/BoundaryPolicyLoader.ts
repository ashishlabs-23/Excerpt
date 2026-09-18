import { supabase } from '../supabaseService';



export interface NarrativeBoundaryPolicy {
  id: string;
  version_number: number;
  stage: 'experimental' | 'candidate' | 'challenger' | 'promoted' | 'retired';
  avg_pre_context: number;
  avg_post_context: number;
  confidence: number;
  stability: number;
  sample_count: number;
}

const DEFAULT_POLICIES_BY_TYPE: Record<string, Partial<NarrativeBoundaryPolicy>> = {
  LateWinner: { avg_pre_context: 4.5, avg_post_context: 3.5, confidence: 0.88 },
  Equalizer: { avg_pre_context: 4.0, avg_post_context: 3.5, confidence: 0.88 },
  Comeback: { avg_pre_context: 5.0, avg_post_context: 3.0, confidence: 0.85 },
  Heroics: { avg_pre_context: 3.5, avg_post_context: 3.0, confidence: 0.85 },
  Controversy: { avg_pre_context: 3.0, avg_post_context: 4.0, confidence: 0.82 },
  VARReview: { avg_pre_context: 3.0, avg_post_context: 4.5, confidence: 0.80 },
  CrowdEruption: { avg_pre_context: 2.5, avg_post_context: 4.0, confidence: 0.85 },
};

export class BoundaryPolicyLoader {
  private static instance: BoundaryPolicyLoader;
  
  // Track the leading active policy per narrative type for normal production renders
  private promotedCache: Map<string, NarrativeBoundaryPolicy> = new Map();
  // Track the leading shadow candidate/challenger policy for A/B tournament generation
  private candidateCache: Map<string, NarrativeBoundaryPolicy> = new Map();
  
  private lastLoadTime: number = 0;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private loadPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): BoundaryPolicyLoader {
    if (!BoundaryPolicyLoader.instance) {
      BoundaryPolicyLoader.instance = new BoundaryPolicyLoader();
    }
    return BoundaryPolicyLoader.instance;
  }

  /**
   * Generates a deterministic baseline policy when DB policies are unavailable.
   */
  public getDefaultPolicy(narrativeType: string, stage: NarrativeBoundaryPolicy['stage'] = 'promoted'): NarrativeBoundaryPolicy {
    const override = DEFAULT_POLICIES_BY_TYPE[narrativeType] || {};
    return {
      id: `default_${stage}_${narrativeType.toLowerCase()}`,
      version_number: 1,
      stage,
      avg_pre_context: override.avg_pre_context ?? 2.5,
      avg_post_context: override.avg_post_context ?? 2.0,
      confidence: override.confidence ?? 0.85,
      stability: 0.90,
      sample_count: 100,
    };
  }

  /**
   * Ensures policies are loaded, awaiting any in-flight load request.
   */
  public async ensureInitialized(): Promise<void> {
    if (this.promotedCache.size > 0 && Date.now() - this.lastLoadTime <= this.REFRESH_INTERVAL_MS) {
      return;
    }
    return this.loadPolicies();
  }

  /**
   * Initializes or refreshes the memory cache from the policy_versions table.
   */
  public async loadPolicies(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = (async () => {
      try {
        const db = supabase();
        const { data, error } = await db.from('policy_versions')
          .select('*')
          .in('stage', ['promoted', 'challenger', 'candidate'])
          .order('version_number', { ascending: false });

        if (error) {
          console.warn('[BoundaryPolicyLoader]: Failed to fetch policies from DB (using defaults):', error.message);
          return;
        }
        
        this.promotedCache.clear();
        this.candidateCache.clear();
        
        for (const row of data || []) {
          const policy: NarrativeBoundaryPolicy = {
            id: row.id,
            version_number: row.version_number,
            stage: row.stage,
            avg_pre_context: row.avg_pre_context,
            avg_post_context: row.avg_post_context,
            confidence: row.confidence,
            stability: row.stability,
            sample_count: row.sample_count
          };

          if (policy.stage === 'promoted' && !this.promotedCache.has(row.narrative_type)) {
            this.promotedCache.set(row.narrative_type, policy);
          } else if ((policy.stage === 'challenger' || policy.stage === 'candidate') && !this.candidateCache.has(row.narrative_type)) {
            this.candidateCache.set(row.narrative_type, policy);
          }
        }
        
        this.lastLoadTime = Date.now();
        console.log(`[BoundaryPolicyLoader]: Loaded ${this.promotedCache.size} promoted and ${this.candidateCache.size} candidate policies.`);
      } catch (e: any) {
        console.warn('[BoundaryPolicyLoader]: Exception during policy load (using defaults):', e?.message || e);
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  public getPromotedPolicy(narrativeType: string, useFallback: boolean = true): NarrativeBoundaryPolicy | null {
    if (Date.now() - this.lastLoadTime > this.REFRESH_INTERVAL_MS) {
      this.loadPolicies().catch(() => {});
    }
    const cached = this.promotedCache.get(narrativeType);
    if (cached) return cached;
    return useFallback ? this.getDefaultPolicy(narrativeType, 'promoted') : null;
  }

  public getCandidatePolicy(narrativeType: string, useFallback: boolean = true): NarrativeBoundaryPolicy | null {
    if (Date.now() - this.lastLoadTime > this.REFRESH_INTERVAL_MS) {
      this.loadPolicies().catch(() => {});
    }
    const cached = this.candidateCache.get(narrativeType);
    if (cached) return cached;
    return useFallback ? this.getDefaultPolicy(narrativeType, 'candidate') : null;
  }
}

export const boundaryPolicyLoader = BoundaryPolicyLoader.getInstance();
