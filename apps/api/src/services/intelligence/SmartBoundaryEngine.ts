import { DetectedEvent, PipelineContext } from './PipelineContext';
import { AdapterRegistry } from './AdapterRegistry';
import { isMultiModalEnabled } from '../../config/features';
import { storyGraphEngine } from './StoryGraphEngine';
import { boundaryPolicyLoader } from './BoundaryPolicyLoader';

export interface BoundaryResult {
  start: number;
  end: number;
  duration: number;
  shadowBounds?: {
    candidateId?: string;
    candidateStart: number;
    candidateEnd: number;
  }
}

export class SmartBoundaryEngine {
  private registry: AdapterRegistry;

  constructor(registry: AdapterRegistry = AdapterRegistry.getInstance()) {
    this.registry = registry;
  }

  /**
   * Computes the ideal start and end time for a clip using the StoryGraph Engine and Policy Loader.
   * Generates shadow bounds for A/B tournament testing.
   */
  public computeBoundary(
    event: DetectedEvent,
    context: PipelineContext
  ): BoundaryResult {
    if (!event) {
      return { start: 0, end: 0, duration: 0 };
    }
    if (!context) {
      return {
        start: Number(event.start?.toFixed(2) || 0),
        end: Number(event.end?.toFixed(2) || 0),
        duration: Number(((event.end || 0) - (event.start || 0)).toFixed(2))
      };
    }
    
    if (!isMultiModalEnabled('smart_boundaries')) {
      return {
        start: Number(event.start.toFixed(2)),
        end: Number(event.end.toFixed(2)),
        duration: Number((event.end - event.start).toFixed(2))
      };
    }

    const bounds = context.storyGraph && 'getNarrativeBounds' in context.storyGraph ? (context.storyGraph as any).getNarrativeBounds(null) : null;

    if (!bounds) {
      return {
        start: Number(event.start.toFixed(2)),
        end: Number(event.end.toFixed(2)),
        duration: Number((event.end - event.start).toFixed(2))
      };
    }

    let renderStart = bounds.start;
    let renderEnd = bounds.end;
    let shadowBounds = undefined;

    if (context.topNarratives && context.topNarratives.length > 0) {
      const narrative = context.topNarratives[0];
      
      const promotedPolicy = boundaryPolicyLoader.getPromotedPolicy(narrative.type);
      const candidatePolicy = boundaryPolicyLoader.getCandidatePolicy(narrative.type);

      // Generate Shadow Bounds if a candidate exists
      if (candidatePolicy) {
        shadowBounds = {
          candidateId: candidatePolicy.id,
          candidateStart: bounds.start - candidatePolicy.avg_pre_context,
          candidateEnd: bounds.end + candidatePolicy.avg_post_context
        };
      }

      // Apply Promoted Policy to Production Bounds
      if (promotedPolicy) {
        renderStart -= promotedPolicy.avg_pre_context;
        renderEnd += promotedPolicy.avg_post_context;
      } else {
        // Fallback to legacy heuristics if no promoted policy exists
        switch (narrative.type) {
          case 'LateWinner':
          case 'Comeback':
              renderStart -= 15;
              renderEnd += 12;
              break;
          case 'GoalkeeperMasterclass':
              renderStart -= 8;
              renderEnd += 5;
              break;
          case 'CrowdEruption':
              renderStart -= 6;
              renderEnd += 18;
              break;
          case 'TacticalMasterclass':
              renderStart -= 20;
              renderEnd += 8;
              break;
          case 'LastMinuteHeartbreak':
              renderStart -= 12;
              renderEnd += 15;
              break;
          default:
              renderStart -= 5;
              renderEnd += 5;
        }
      }
    } else {
      renderStart -= 5;
      renderEnd += 5;
    }

    // Clamp to 0
    renderStart = Math.max(0, renderStart);
    if (shadowBounds) shadowBounds.candidateStart = Math.max(0, shadowBounds.candidateStart);

    return {
      start: Number(renderStart.toFixed(2)),
      end: Number(renderEnd.toFixed(2)),
      duration: Number((renderEnd - renderStart).toFixed(2)),
      shadowBounds
    };
  }
}

export const smartBoundaryEngine = new SmartBoundaryEngine();
