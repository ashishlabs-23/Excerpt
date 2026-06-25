import { supabase } from './supabaseService';

export interface VideoTimelineCoverageRecord {
  id?: string;
  video_id: string;
  start_time: number;
  end_time: number;
  clip_id?: string;
  transcript_hash?: string;
  story_signature?: string;
  event_signature?: string;
  semantic_summary?: string;
  embedding?: number[];
  created_at?: string;
}

export class VideoMemoryService {
  private static instance: VideoMemoryService;

  private constructor() {}

  public static getInstance(): VideoMemoryService {
    if (!VideoMemoryService.instance) {
      VideoMemoryService.instance = new VideoMemoryService();
    }
    return VideoMemoryService.instance;
  }

  /**
   * Enforces Timeline Exclusion Zone check and duplicate prevention.
   * exclusionBuffer = max(10, clipDuration * 0.25)
   */
  public async checkOverlap(videoId: string, startTime: number, endTime: number): Promise<boolean> {
    const duration = endTime - startTime;
    const buffer = Math.max(10, duration * 0.25);
    const checkStart = startTime - buffer;
    const checkEnd = endTime + buffer;

    // Fetch all timeline coverages for the given video
    const { data, error } = await supabase()
      .from('video_timeline_coverage')
      .select('start_time, end_time')
      .eq('video_id', videoId);

    if (error) {
      console.error('[VideoMemoryService] Error fetching timeline coverage overlap:', error.message);
      return false;
    }

    if (!data || data.length === 0) {
      return false;
    }

    // Check if new interval overlaps with any previous timeline exclusion zones
    for (const record of data) {
      const recDuration = record.end_time - record.start_time;
      const recBuffer = Math.max(10, recDuration * 0.25);
      const exclStart = record.start_time - recBuffer;
      const exclEnd = record.end_time + recBuffer;

      // Overlap condition: start1 < end2 AND start2 < end1
      if (checkStart < exclEnd && exclStart < checkEnd) {
        console.log(`[VideoMemoryService] Timeline Exclusion Zone Overlap Detected: [${startTime.toFixed(1)}, ${endTime.toFixed(1)}] overlaps [${record.start_time.toFixed(1)}, ${record.end_time.toFixed(1)}] with buffer.`);
        return true;
      }
    }

    return false;
  }

  /**
   * Performs Semantic similarity comparison (Phase 2 check) using Supabase pgvector or in-memory fallback.
   */
  public async checkSemanticSimilarity(videoId: string, targetEmbedding: number[], threshold = 0.80): Promise<boolean> {
    try {
      // Direct supabase remote procedure call or simple cosine similarity fallback
      const { data, error } = await supabase()
        .rpc('match_clip_embeddings', {
          query_embedding: targetEmbedding,
          match_threshold: threshold,
          match_count: 1,
          target_video_id: videoId
        });

      if (error) {
        // Fallback: load embeddings locally and compute similarity
        console.warn('[VideoMemoryService] match_clip_embeddings RPC not available, running local fallback logic.');
        const { data: records, error: fetchError } = await supabase()
          .from('video_timeline_coverage')
          .select('embedding')
          .eq('video_id', videoId)
          .not('embedding', 'is', null);

        if (fetchError || !records) return false;

        for (const rec of records) {
          if (rec.embedding) {
            let vectorB: number[] = [];
            if (typeof rec.embedding === 'string') {
              try {
                vectorB = rec.embedding.replace('[', '').replace(']', '').split(',').map(Number);
              } catch (e) {
                console.warn('[VideoMemoryService] Failed to parse vector string:', rec.embedding);
                continue;
              }
            } else if (Array.isArray(rec.embedding)) {
              vectorB = rec.embedding;
            }

            if (!vectorB || vectorB.length === 0) {
              continue;
            }

            const sim = this.cosineSimilarity(targetEmbedding, vectorB);
            if (sim > threshold) {
              console.log(`[VideoMemoryService] Semantic similarity duplicate detected: similarity score = ${sim.toFixed(3)}`);
              return true;
            }
          }
        }
        return false;
      }

      return data && data.length > 0;
    } catch (e: any) {
      console.error('[VideoMemoryService] Error during semantic check:', e.message);
      return false;
    }
  }

  /**
   * Save a completed clip generation segment coverage record.
   */
  public async recordClipCoverage(record: VideoTimelineCoverageRecord): Promise<void> {
    const { error } = await supabase()
      .from('video_timeline_coverage')
      .insert(record);

    if (error) {
      console.error('[VideoMemoryService] Failed to record clip coverage:', error.message);
      throw error;
    }
    console.log(`[VideoMemoryService] Recorded timeline coverage for clip ${record.clip_id || 'unknown'} in zone [${record.start_time.toFixed(1)}, ${record.end_time.toFixed(1)}]`);
  }

  /**
   * Helper to compute cosine similarity locally
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
