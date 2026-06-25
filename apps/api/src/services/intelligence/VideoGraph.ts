export interface VisualRegion {
  slot: string;
  trackId?: number;
  x: number;
  y: number;
  confidence: number;
}

export interface GraphVisualNode {
  time: number;
  layout: string;
  regions: VisualRegion[];
  dominantContentType: string; // 'talking_head', 'screen_recording', 'gameplay', etc.
}

export interface GraphAudioNode {
  time: number;
  duration: number;
  energy: number; // Volume / excitement level
  isSilence: boolean;
}

export interface GraphSemanticEvent {
  id: string;
  timeStart: number;
  timeEnd: number;
  type: 'emotion' | 'crowd_roar' | 'goal' | 'punchline' | 'hook' | 'payoff';
  intensity: number; // 0.0 to 1.0
  metadata?: Record<string, any>;
}

export interface GraphWord {
  word: string;
  start: number;
  end: number;
  speaker?: string;
  confidence?: number;
}

export interface GraphTranscriptSentence {
  text: string;
  start: number;
  end: number;
  words: GraphWord[];
  speaker?: string;
}

/**
 * The unified memory representation of a video.
 */
export class VideoIntelligenceGraph {
  public videoId: string;
  public totalDuration: number;
  
  // High-level metadata
  public category: string = 'unknown';
  public title: string = '';

  // Core Modality Timelines
  public transcript: GraphTranscriptSentence[] = [];
  public visual: GraphVisualNode[] = [];
  public audio: GraphAudioNode[] = [];
  public semanticEvents: GraphSemanticEvent[] = [];

  constructor(videoId: string, totalDuration: number) {
    this.videoId = videoId;
    this.totalDuration = totalDuration;
  }

  /**
   * Retrieves all multimodal data active at a specific timestamp.
   */
  public queryTime(timeSeconds: number) {
    return {
      sentence: this.transcript.find(s => timeSeconds >= s.start && timeSeconds <= s.end),
      visual: this.visual.reduce((prev, curr) => 
        Math.abs(curr.time - timeSeconds) < Math.abs(prev.time - timeSeconds) ? curr : prev
      ),
      audio: this.audio.find(a => timeSeconds >= a.time && timeSeconds <= (a.time + a.duration)),
      activeEvents: this.semanticEvents.filter(e => timeSeconds >= e.timeStart && timeSeconds <= e.timeEnd)
    };
  }

  /**
   * Serializes the graph to JSON for caching.
   */
  public toJSON(): string {
    return JSON.stringify({
      videoId: this.videoId,
      totalDuration: this.totalDuration,
      category: this.category,
      title: this.title,
      transcript: this.transcript,
      visual: this.visual,
      audio: this.audio,
      semanticEvents: this.semanticEvents
    });
  }

  /**
   * Deserializes the graph from JSON.
   */
  public static fromJSON(jsonStr: string): VideoIntelligenceGraph {
    const data = JSON.parse(jsonStr);
    const graph = new VideoIntelligenceGraph(data.videoId, data.totalDuration);
    graph.category = data.category;
    graph.title = data.title;
    graph.transcript = data.transcript;
    graph.visual = data.visual;
    graph.audio = data.audio;
    graph.semanticEvents = data.semanticEvents;
    return graph;
  }
}
