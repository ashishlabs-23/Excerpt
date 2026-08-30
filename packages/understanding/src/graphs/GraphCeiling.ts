import { GraphNode, UnderstandingConfig } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

export class GraphCeiling {
  /**
   * Truncates nodes if they exceed the maximum ceiling derived from media duration.
   * Nodes are retained based on highest confidence.
   */
  static enforceCeiling<T extends GraphNode>(
    nodes: T[],
    durationMs: number,
    config: UnderstandingConfig,
    logger: Logger,
    graphType: string
  ): T[] {
    const durationMinutes = durationMs / 60000;
    // Allow at least 1 minute equivalent of nodes, even for very short clips
    const effectiveMinutes = Math.max(1, durationMinutes);
    const maxNodes = Math.ceil(effectiveMinutes * config.maxNodesPerMinute);

    if (nodes.length > maxNodes) {
      logger.warn(`Graph size ceiling exceeded for ${graphType}. Generated: ${nodes.length}, Ceiling: ${maxNodes}. Truncating to highest confidence.`);
      
      // Sort descending by confidence
      const sortedByConfidence = [...nodes].sort((a, b) => b.confidence - a.confidence);
      
      // Take top maxNodes and re-sort them chronologically
      const truncated = sortedByConfidence.slice(0, maxNodes);
      return truncated.sort((a, b) => a.startMs - b.startMs);
    }

    return nodes;
  }
}
