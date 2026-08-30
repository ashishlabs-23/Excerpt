export interface PerceptionSignal<T> {
  available: boolean;
  data: T | null;
}

export interface PerceptionFrame {
  timestampMs: number;
  durationMs: number;
  
  // Mandatory
  transcriptWords: PerceptionSignal<any[]>;
  speaker: PerceptionSignal<any>;
  
  // Optional
  faces: PerceptionSignal<any[]>;
  persons: PerceptionSignal<any[]>;
  objects: PerceptionSignal<any[]>;
  scene: PerceptionSignal<any>;
  motion: PerceptionSignal<any>;
  audioEnergy: PerceptionSignal<number>;
  pitch: PerceptionSignal<number>;
  emotion: PerceptionSignal<string>;
  visualSaliency: PerceptionSignal<any>;
  cameraMotion: PerceptionSignal<string>;
}

export interface TemporalPerceptionStream {
  frames: PerceptionFrame[];
}

export interface PerceptionResult {
  stream: TemporalPerceptionStream;
  completeness: number; // 0.0 to 1.0
}

export interface PerceptionEngineConfig {
  engineName: string;
  engineVersion: string;
  maxCostUsd?: number;
  timeoutMs: number;
  customArgs?: Record<string, any>;
}
