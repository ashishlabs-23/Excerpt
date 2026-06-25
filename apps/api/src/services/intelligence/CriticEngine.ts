import { StoryArc, CandidateRange } from './StoryGraph';
import { VideoIntelligenceGraph } from './VideoGraph';

export interface CriticResult {
  approved: boolean;
  reason: string;
}

export class CriticEngine {
  
  /**
   * Runs multiple critic passes over a candidate clip.
   */
  public evaluateCandidate(candidate: CandidateRange, story: StoryArc, vig: VideoIntelligenceGraph): CriticResult {
    
    // 1. Narrative Critic
    const narrativeResult = this.narrativeCritic(candidate, story);
    if (!narrativeResult.approved) return narrativeResult;

    // 2. Context Critic
    const contextResult = this.contextCritic(candidate, story, vig);
    if (!contextResult.approved) return contextResult;

    // 3. Retention Critic
    const retentionResult = this.retentionCritic(candidate, vig);
    if (!retentionResult.approved) return retentionResult;

    // 4. Visual Critic
    const visualResult = this.visualCritic(candidate, vig);
    if (!visualResult.approved) return visualResult;

    return { approved: true, reason: 'Passed all critic layers.' };
  }

  private narrativeCritic(candidate: CandidateRange, story: StoryArc): CriticResult {
    // Does the clip actually contain the climax and resolution?
    if (candidate.end < story.boundaries.climax) {
      return { approved: false, reason: 'Ends before the climax.' };
    }
    return { approved: true, reason: 'Narratively complete.' };
  }

  private contextCritic(candidate: CandidateRange, story: StoryArc, vig: VideoIntelligenceGraph): CriticResult {
    if (story.context_required && candidate.start > story.boundaries.hook_start) {
      return { approved: false, reason: 'Context is required but the candidate cuts out the setup.' };
    }
    return { approved: true, reason: 'Context sufficient.' };
  }

  private retentionCritic(candidate: CandidateRange, vig: VideoIntelligenceGraph): CriticResult {
    // First 3 seconds strong?
    const hookAudio = vig.audio.filter(a => a.time >= candidate.start && a.time <= candidate.start + 3);
    const hasSilence = hookAudio.some(a => a.isSilence);
    if (hasSilence && hookAudio.length > 0) {
      return { approved: false, reason: 'First 3 seconds contains silence (weak hook).' };
    }
    return { approved: true, reason: 'Strong hook retention expected.' };
  }

  private visualCritic(candidate: CandidateRange, vig: VideoIntelligenceGraph): CriticResult {
    // Basic crop check
    const visualNodes = vig.visual.filter(v => v.time >= candidate.start && v.time <= candidate.end);
    if (visualNodes.length > 0) {
      // Check for completely missing face data in a talking head segment
      const isTalkingHead = visualNodes.some(v => v.dominantContentType === 'talking_head');
      const hasFaces = visualNodes.some(v => v.regions.length > 0);
      if (isTalkingHead && !hasFaces) {
        return { approved: false, reason: 'No faces found in visual tracking data.' };
      }
    }
    return { approved: true, reason: 'Visual tracking data is sound.' };
  }
}
