import { VideoIntelligenceGraph } from './VideoGraph';
import { EventGraph } from './EventGraph';
import { StoryGraph } from './StoryGraph';
import { SemanticSegmenter } from './SemanticSegmenter';
import { StoryReasoningProvider, GeminiReasoningProvider, StoryMemory } from './StoryReasoningProvider';

export class StoryBuilderService {
  private segmenter = new SemanticSegmenter();
  private provider: StoryReasoningProvider = new GeminiReasoningProvider(); // Can be dynamically injected

  /**
   * Constructs the StoryGraph from the VIG and EventGraph.
   */
  public async buildStoryGraph(vig: VideoIntelligenceGraph, eventGraph: EventGraph): Promise<StoryGraph> {
    const storyGraph = new StoryGraph();
    
    // 1. Chunk semantic events
    const eventChunks = this.segmenter.segment(vig, eventGraph);
    console.log(`[StoryBuilder]: Segmented video into ${eventChunks.length} logical chunks.`);

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
        console.error(`[StoryBuilder]: Failed to process chunk ${i + 1}:`, err);
      }
    }

    console.log(`[StoryBuilder]: Built StoryGraph with ${storyGraph.stories.length} stories.`);
    return storyGraph;
  }
}
