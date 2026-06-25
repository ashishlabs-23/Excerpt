import { supabase } from './supabaseService';
import crypto from 'crypto';

export interface PipelineVersions {
  analysis_version: string;
  ranking_version: string;
  render_version: string;
}

export interface CacheRecordIntegrity {
  created_at: string;
  pipeline_versions: PipelineVersions;
  checksum: string;
  cache_status: 'valid' | 'invalid';
}

export interface VideoAnalysisCacheRow {
  video_hash: string;
  created_at?: string;
  pipeline_versions: PipelineVersions;
  checksum: string;
  raw_analysis?: any;
  candidate_moments?: any;
  render_plans?: any;
  telemetry?: any;
}

export class AnalysisCacheService {
  private static instance: AnalysisCacheService;

  private constructor() {}

  public static getInstance(): AnalysisCacheService {
    if (!AnalysisCacheService.instance) {
      AnalysisCacheService.instance = new AnalysisCacheService();
    }
    return AnalysisCacheService.instance;
  }

  /**
   * Generates video_hash = SHA256(youtube_video_id + rounded_duration)
   */
  public generateVideoHash(youtubeVideoId: string, duration: number): string {
    const roundedDuration = Math.round(duration);
    const rawString = `${youtubeVideoId}_${roundedDuration}`;
    return crypto.createHash('sha256').update(rawString).digest('hex');
  }

  private normalizeJSON(obj: any): any {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      return obj.map(item => this.normalizeJSON(item));
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      const normalized: any = {};
      for (const key of keys) {
        normalized[key] = this.normalizeJSON(obj[key]);
      }
      return normalized;
    }
    return obj;
  }

  /**
   * Calculates checksum of cache data payload to detect corruption
   */
  private calculateChecksum(rawAnalysis: any, candidateMoments: any, renderPlans: any): string {
    const dataStr = JSON.stringify({
      raw: this.normalizeJSON(rawAnalysis),
      candidates: this.normalizeJSON(candidateMoments),
      render: this.normalizeJSON(renderPlans),
    });
    return crypto.createHash('sha256').update(dataStr).digest('hex');
  }

  /**
   * Fetches cache entry by video_hash. Performs strict validation on versions and checksum.
   */
  public async getCache(
    videoHash: string,
    requiredVersions: PipelineVersions
  ): Promise<{
    rawAnalysis: any | null;
    candidateMoments: any | null;
    renderPlans: any | null;
    telemetry?: any | null;
    integrity: CacheRecordIntegrity | null;
  }> {
    try {
      const { data, error } = await supabase()
        .from('video_analysis_cache')
        .select('*')
        .eq('video_hash', videoHash)
        .maybeSingle();

      if (error) {
        console.error('[AnalysisCacheService] Database error fetching cache:', error.message);
        return { rawAnalysis: null, candidateMoments: null, renderPlans: null, telemetry: null, integrity: null };
      }

      if (!data) {
        return { rawAnalysis: null, candidateMoments: null, renderPlans: null, telemetry: null, integrity: null };
      }

      const row = data as VideoAnalysisCacheRow;
      const dbVersions = row.pipeline_versions || {};

      // Check version compatibility
      const versionsMatch =
        dbVersions.analysis_version === requiredVersions.analysis_version &&
        dbVersions.ranking_version === requiredVersions.ranking_version &&
        dbVersions.render_version === requiredVersions.render_version;

      if (!versionsMatch) {
        console.log(`[AnalysisCacheService] Cache version mismatch. Expected ${JSON.stringify(requiredVersions)}, got ${JSON.stringify(dbVersions)}`);
        await this.invalidateCache(videoHash);
        return { rawAnalysis: null, candidateMoments: null, renderPlans: null, telemetry: null, integrity: null };
      }

      // Checksum validation
      const currentChecksum = this.calculateChecksum(row.raw_analysis, row.candidate_moments, row.render_plans);
      if (currentChecksum !== row.checksum) {
        console.warn(`[AnalysisCacheService] Cache checksum mismatch. Data might be corrupted. Invalidating.`);
        await this.invalidateCache(videoHash);
        return { rawAnalysis: null, candidateMoments: null, renderPlans: null, telemetry: null, integrity: null };
      }

      const integrity: CacheRecordIntegrity = {
        created_at: row.created_at || new Date().toISOString(),
        pipeline_versions: row.pipeline_versions,
        checksum: row.checksum,
        cache_status: 'valid',
      };

      return {
        rawAnalysis: row.raw_analysis,
        candidateMoments: row.candidate_moments,
        renderPlans: row.render_plans,
        telemetry: row.telemetry,
        integrity,
      };
    } catch (e: any) {
      console.error('[AnalysisCacheService] Failed to read cache:', e.message);
      return { rawAnalysis: null, candidateMoments: null, renderPlans: null, telemetry: null, integrity: null };
    }
  }

  /**
   * Sets or updates cache for a video_hash
   */
  public async setCache(
    videoHash: string,
    versions: PipelineVersions,
    data: {
      rawAnalysis?: any;
      candidateMoments?: any;
      renderPlans?: any;
      telemetry?: any;
    }
  ): Promise<void> {
    try {
      // Fetch existing row first to merge updates if needed
      const { data: existing } = await supabase()
        .from('video_analysis_cache')
        .select('*')
        .eq('video_hash', videoHash)
        .maybeSingle();

      const mergedRaw = data.rawAnalysis !== undefined ? data.rawAnalysis : (existing?.raw_analysis || null);
      const mergedCandidates = data.candidateMoments !== undefined ? data.candidateMoments : (existing?.candidate_moments || null);
      const mergedRender = data.renderPlans !== undefined ? data.renderPlans : (existing?.render_plans || null);

      const checksum = this.calculateChecksum(mergedRaw, mergedCandidates, mergedRender);

      const record: VideoAnalysisCacheRow = {
        video_hash: videoHash,
        pipeline_versions: versions,
        checksum,
        raw_analysis: mergedRaw,
        candidate_moments: mergedCandidates,
        render_plans: mergedRender,
        telemetry: data.telemetry || {},
      };

      const { error } = await supabase()
        .from('video_analysis_cache')
        .upsert(record);

      if (error) {
        console.error('[AnalysisCacheService] Database error writing cache:', error.message);
        throw error;
      }

      console.log(`[AnalysisCacheService] Cache successfully written/updated for hash: ${videoHash}`);
    } catch (e: any) {
      console.error('[AnalysisCacheService] Failed to save cache:', e.message);
    }
  }

  /**
   * Invalidate/delete cache record
   */
  public async invalidateCache(videoHash: string): Promise<void> {
    try {
      const { error } = await supabase()
        .from('video_analysis_cache')
        .delete()
        .eq('video_hash', videoHash);

      if (error) {
        console.error('[AnalysisCacheService] Database error invalidating cache:', error.message);
      } else {
        console.log(`[AnalysisCacheService] Invalidated cache entry for video_hash: ${videoHash}`);
      }
    } catch (e: any) {
      console.error('[AnalysisCacheService] Failed to invalidate cache:', e.message);
    }
  }
}
