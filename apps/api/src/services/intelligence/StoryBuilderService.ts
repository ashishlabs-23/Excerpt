import { VideoIntelligenceGraph } from './VideoGraph';
import { EventGraph } from './EventGraph';
import { StoryGraph } from './StoryGraph';
import { SemanticSegmenter } from './SemanticSegmenter';
import { StoryReasoningProvider, GeminiReasoningProvider, StoryMemory } from './StoryReasoningProvider';

export class StoryBuilderService {
  private segmenter: SemanticSegmenter;
  private provider: StoryReasoningProvider;

  constructor(provider?: StoryReasoningProvider, segmenter?: SemanticSegmenter) {
    this.provider = provider || new GeminiReasoningProvider();
    this.segmenter = segmenter || new SemanticSegmenter();
  }

  /**
   * Coalesces tiny chunks (<35s) with their successor to minimize sequential LLM calls.
   */
  private coalesceChunks(chunks: import('./EventGraph').EventNode[][]): import('./EventGraph').EventNode[][] {
    if (chunks.length <= 6) return chunks;
    const merged: import('./EventGraph').EventNode[][] = [];
    let current: import('./EventGraph').EventNode[] = [];

    for (const chunk of chunks) {
      if (chunk.length === 0) continue;
      const chunkDur = (chunk[chunk.length - 1].timestamp + chunk[chunk.length - 1].duration) - chunk[0].timestamp;
      if (current.length === 0) {
        current = chunk;
      } else {
        const curDur = (current[current.length - 1].timestamp + current[current.length - 1].duration) - current[0].timestamp;
        if (curDur < 45 && (curDur + chunkDur) < 180) {
          // Merge small chunk
          current = [...current, ...chunk];
        } else {
          merged.push(current);
          current = chunk;
        }
      }
    }
    if (current.length > 0) merged.push(current);
    return merged.length > 0 ? merged : chunks;
  }

  /**
   * Constructs the StoryGraph from the VIG and EventGraph.
   */
  public async buildStoryGraph(vig: VideoIntelligenceGraph, eventGraph: EventGraph): Promise<StoryGraph> {
    const storyGraph = new StoryGraph();
    
    // 1. Chunk semantic events & coalesce tiny chunks to reduce latency
    const rawChunks = this.segmenter.segment(vig, eventGraph);
    const eventChunks = this.coalesceChunks(rawChunks);
    console.log(`[StoryBuilder]: Segmented video into ${eventChunks.length} logical chunks (coalesced from ${rawChunks.length}).`);

    // 2. Setup rolling memory
    let memory: StoryMemory = {
      characters: [],
      topics: [],
      openLoops: []
    };

    // 3. Process chunks sequentially to preserve memory context
    for (let i = 0; i < eventChunks.length; i++) {
      console.log(`[StoryBuilder]: Analyzing chunk ${i + 1}/${eventChunks.length}...`);
      const chunk = eventChunks[i];
      
      try {
        const result = await this.provider.findStories(chunk, memory);
        
        // Add identified stories to the graph
        for (const story of result.stories) {
          storyGraph.addStory(story);
        }

        // Update rolling memory for the next chunk
        memory = result.updatedMemory;
      } catch (err) {
        console.error(`[StoryBuilder]: Failed to process chunk ${i + 1}, executing fallback:`, err);
        if (this.provider instanceof GeminiReasoningProvider) {
          const fallback = this.provider.generateFallbackStories(chunk, memory);
          for (const story of fallback.stories) {
            storyGraph.addStory(story);
          }
          memory = fallback.updatedMemory;
        }
      }
    }

    console.log(`[StoryBuilder]: Built StoryGraph with ${storyGraph.stories.length} stories.`);
    return storyGraph;
  }
}
