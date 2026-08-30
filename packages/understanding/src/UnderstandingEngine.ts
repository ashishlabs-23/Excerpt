import { 
  MediaArtifact, 
  TemporalPerceptionStream, 
  UnderstandingConfig,
  SceneGraph,
  StoryGraph,
  MomentGraph,
  TopicGraph
} from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import { LLMOrchestrator, LLMGenerator } from './llm/LLMOrchestrator';
import { GraphCeiling } from './graphs/GraphCeiling';

export interface UnderstandingResult {
  sceneGraph: SceneGraph;
  storyGraph: StoryGraph;
  momentGraph: MomentGraph;
  topicGraph: TopicGraph;
}

export class UnderstandingEngine {
  private orchestrator: LLMOrchestrator;

  constructor(private logger: Logger) {
    this.orchestrator = new LLMOrchestrator(logger);
  }

  async analyze(
    artifact: MediaArtifact,
    stream: TemporalPerceptionStream,
    config: UnderstandingConfig,
    generators: {
      scene: LLMGenerator<SceneGraph>,
      story: LLMGenerator<StoryGraph>,
      moment: LLMGenerator<MomentGraph>,
      topic: LLMGenerator<TopicGraph>
    }
  ): Promise<UnderstandingResult> {
    
    // Process in parallel
    const [rawScene, rawStory, rawMoment, rawTopic] = await Promise.all([
      this.orchestrator.generateGraphWithRetry(
        generators.scene,
        "Generate SceneGraph...",
        artifact.durationMs,
        "SceneGraph",
        false // Scenes cannot overlap
      ),
      this.orchestrator.generateGraphWithRetry(
        generators.story,
        "Generate StoryGraph...",
        artifact.durationMs,
        "StoryGraph",
        true // Story arcs can overlap
      ),
      this.orchestrator.generateGraphWithRetry(
        generators.moment,
        "Generate MomentGraph...",
        artifact.durationMs,
        "MomentGraph",
        true // Moments can overlap
      ),
      this.orchestrator.generateGraphWithRetry(
        generators.topic,
        "Generate TopicGraph...",
        artifact.durationMs,
        "TopicGraph",
        true // Topics can overlap
      )
    ]);

    // Apply strict ceilings before returning
    const sceneNodes = GraphCeiling.enforceCeiling(rawScene.nodes, artifact.durationMs, config, this.logger, "SceneGraph");
    const storyNodes = GraphCeiling.enforceCeiling(rawStory.nodes, artifact.durationMs, config, this.logger, "StoryGraph");
    const momentNodes = GraphCeiling.enforceCeiling(rawMoment.nodes, artifact.durationMs, config, this.logger, "MomentGraph");
    const topicNodes = GraphCeiling.enforceCeiling(rawTopic.nodes, artifact.durationMs, config, this.logger, "TopicGraph");

    return {
      sceneGraph: { schemaVersion: rawScene.schemaVersion, nodes: sceneNodes },
      storyGraph: { schemaVersion: rawStory.schemaVersion, nodes: storyNodes },
      momentGraph: { schemaVersion: rawMoment.schemaVersion, nodes: momentNodes },
      topicGraph: { schemaVersion: rawTopic.schemaVersion, nodes: topicNodes }
    };
  }
}
