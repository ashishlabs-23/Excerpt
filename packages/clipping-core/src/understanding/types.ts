export interface GraphNode {
  startMs: number;
  endMs: number;
  confidence: number;
  description: string;
}

export interface SceneNode extends GraphNode {
  setting: string;
}

export interface StoryNode extends GraphNode {
  arc: string;
}

export interface MomentNode extends GraphNode {
  impact: number;
}

export interface TopicNode extends GraphNode {
  topic: string;
}

export interface Graph<T extends GraphNode> {
  schemaVersion: string;
  nodes: T[];
}

export type SceneGraph = Graph<SceneNode>;
export type StoryGraph = Graph<StoryNode>;
export type MomentGraph = Graph<MomentNode>;
export type TopicGraph = Graph<TopicNode>;

export interface UnderstandingConfig {
  maxNodesPerMinute: number;
  modelName: string;
}
