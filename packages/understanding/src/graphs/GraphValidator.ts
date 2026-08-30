import { GraphNode } from '@excerpt/clipping-core';

export class GraphValidator {
  /**
   * Validates structural integrity and timestamp bounding for generated graph nodes.
   * Returns an array of error messages, or an empty array if valid.
   */
  static validate(nodes: GraphNode[], mediaDurationMs: number, allowOverlap: boolean = false): string[] {
    const errors: string[] = [];
    
    // Sort nodes to check continuity if needed
    const sortedNodes = [...nodes].sort((a, b) => a.startMs - b.startMs);

    for (let i = 0; i < sortedNodes.length; i++) {
      const node = sortedNodes[i];
      
      // 1. Timestamp Integrity
      if (node.startMs < 0) {
        errors.push(`Node ${i} has negative startMs: ${node.startMs}`);
      }
      if (node.endMs > mediaDurationMs) {
        errors.push(`Node ${i} endMs (${node.endMs}) exceeds media duration (${mediaDurationMs})`);
      }
      if (node.startMs >= node.endMs) {
        errors.push(`Node ${i} has invalid interval: startMs (${node.startMs}) >= endMs (${node.endMs})`);
      }

      // 2. Continuity
      if (!allowOverlap && i > 0) {
        const prevNode = sortedNodes[i - 1];
        if (node.startMs < prevNode.endMs) {
          errors.push(`Node ${i} overlaps with previous node: startMs (${node.startMs}) < prev endMs (${prevNode.endMs})`);
        }
      }
    }

    return errors;
  }
}
