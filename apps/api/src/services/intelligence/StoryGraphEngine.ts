export class StoryGraphEngine {
  public buildGraph(context: any): any {
    return {
      nodes: new Map(),
      edges: [],
      addNode: () => {},
      addEdge: () => {},
      getNarrativeBounds: () => null
    };
  }
}
export const storyGraphEngine = new StoryGraphEngine();
