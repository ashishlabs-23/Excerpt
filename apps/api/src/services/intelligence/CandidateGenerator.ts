import { StoryArc, CandidateRange } from './StoryGraph';

export class CandidateGenerator {
  
  /**
   * Generates multiple distinct edit boundaries (candidates) for a single StoryArc.
   * Emulates a human editor trying different cuts (e.g. tight hook vs loose context).
   */
  public generateCandidates(story: StoryArc): StoryArc {
    const candidates: CandidateRange[] = [];
    
    // Core boundaries
    const { hook_start, climax, resolution } = story.boundaries;
    const coreDuration = resolution - hook_start;
    
    // 1. The Core Cut (Exactly what the AI boundary says)
    candidates.push({
      start: hook_start,
      end: resolution,
      reasoning: 'Core story arc from hook to resolution.'
    });

    // 2. The Tight Cut (Focus heavily on climax and payoff)
    if (coreDuration > 20) {
      candidates.push({
        start: Math.max(hook_start, climax - 15),
        end: resolution,
        reasoning: 'Tightened cut skipping early context to focus on climax.'
      });
    }

    // 3. The Contextual Cut (Include 5 seconds before the hook for breathing room)
    candidates.push({
      start: Math.max(0, hook_start - 5),
      end: resolution + 2,
      reasoning: 'Looser cut providing more context before the hook and after resolution.'
    });

    // 4. Platform Specific Cuts (e.g., Short-form extreme crop)
    if (coreDuration > 60) {
      // Create a 60-second capped version
      candidates.push({
        start: hook_start,
        end: hook_start + 60,
        reasoning: 'Capped 60s version for TikTok/Shorts strict limits.'
      });
    }

    story.candidate_ranges = candidates;
    return story;
  }
}
