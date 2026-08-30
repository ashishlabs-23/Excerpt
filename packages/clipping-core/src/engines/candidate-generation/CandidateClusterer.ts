import { RawClipCandidate } from '../../types/pipeline';

export class CandidateClusterer {
  /**
   * Clusters candidates to ensure diversity and selects the best from each cluster.
   */
  public clusterCandidates(candidates: RawClipCandidate[]): RawClipCandidate[] {
    const clusters: RawClipCandidate[][] = [];

    for (const candidate of candidates) {
      let addedToCluster = false;
      
      for (const cluster of clusters) {
        const representative = cluster[0];
        
        // 1. Temporal Overlap
        const startMax = Math.max(candidate.start_time, representative.start_time);
        const endMin = Math.min(candidate.end_time, representative.end_time);
        const overlapDuration = Math.max(0, endMin - startMax);
        const candidateDuration = candidate.end_time - candidate.start_time;
        const temporalOverlapRatio = overlapDuration / candidateDuration;

        // 2. Semantic Similarity (heuristic: similar emotion or curiosity gap)
        const semanticMatch = candidate.emotion === representative.emotion || 
                              this.calculateTextSimilarity(candidate.summary, representative.summary) > 0.6;
                              
        // 3. Shared Events / Actors (if temporal overlap is high, it's the same event)
        if (temporalOverlapRatio > 0.4 || (temporalOverlapRatio > 0.2 && semanticMatch)) {
          cluster.push(candidate);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push([candidate]);
      }
    }

    // From each cluster, pick the one with the highest confidence
    const diverseCandidates = clusters.map(cluster => {
      return cluster.reduce((best, current) => 
        (current.confidence > best.confidence) ? current : best
      );
    });

    return diverseCandidates;
  }
  
  private calculateTextSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/\\W+/));
    const wordsB = new Set(b.toLowerCase().split(/\\W+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
