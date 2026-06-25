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

export class BoundaryPolicyLoader {
  private static instance: BoundaryPolicyLoader;
  
  // Track the leading active policy per narrative type for normal production renders
  private promotedCache: Map<string, NarrativeBoundaryPolicy> = new Map();
  // Track the leading shadow candidate/challenger policy for A/B tournament generation
  private candidateCache: Map<string, NarrativeBoundaryPolicy> = new Map();
  
  private lastLoadTime: number = 0;
  private readonly REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  public static getInstance(): BoundaryPolicyLoader {
    if (!BoundaryPolicyLoader.instance) {
      BoundaryPolicyLoader.instance = new BoundaryPolicyLoader();
    }
    return BoundaryPolicyLoader.instance;
  }

  /**
   * Initializes or refreshes the memory cache from the policy_versions table.
   */
  public async loadPolicies(): Promise<void> {
    const db = supabase();
    try {
      const { data, error } = await db.from('policy_versions')
        .select('*')
        .in('stage', ['promoted', 'challenger', 'candidate'])
        .order('version_number', { ascending: false });

      if (error) {
        console.error('[BoundaryPolicyLoader]: Failed to fetch policies:', error);
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
    } catch (e) {
      console.error('[BoundaryPolicyLoader]: Exception during policy load:', e);
    }
  }

  public getPromotedPolicy(narrativeType: string): NarrativeBoundaryPolicy | null {
    if (Date.now() - this.lastLoadTime > this.REFRESH_INTERVAL_MS) {
      this.loadPolicies().catch(() => {});
    }
    return this.promotedCache.get(narrativeType) || null;
  }

  public getCandidatePolicy(narrativeType: string): NarrativeBoundaryPolicy | null {
    if (Date.now() - this.lastLoadTime > this.REFRESH_INTERVAL_MS) {
      this.loadPolicies().catch(() => {});
    }
    return this.candidateCache.get(narrativeType) || null;
  }
}

export const boundaryPolicyLoader = BoundaryPolicyLoader.getInstance();
