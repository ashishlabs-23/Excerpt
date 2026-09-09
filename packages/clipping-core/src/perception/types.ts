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

export interface PerceptionBuildConfig {
  schemaVersion: string;
  ffmpegVersion: string;
  transcriptionProvider: string;
  transcriptionModel: string;
  transcriptionLanguage: string;
  audioSampleRateHz: number;
  sceneThreshold: number;
  visualFps: number;
  cropPlannerVersion: string;
  [key: string]: any;
}

export interface ExtractorManifest {
  ffmpegVersion: string;
  transcriptionProvider: string;
  transcriptionModel: string;
  perceptionSchemaVersion: string;
  audioSampleRateHz: number;
  sceneThreshold: number;
  config: PerceptionBuildConfig;
  [key: string]: any;
}

export interface AudioEvent {
  type: 'loudness_peak' | 'silence' | string;
  startSec: number;
  endSec: number;
  value: number;
}

export interface SceneEvent {
  startSec: number;
  endSec: number;
  score: number;
}

export interface SpeakerTrack {
  speakerId: string;
  startSec: number;
  endSec: number;
  centerX: number;
  centerY: number;
  speakingProbability: number;
  confidence: number;
}

export interface PerceptionSnapshot {
  schemaVersion: string;
  cacheKey: string;
  checksum?: string;
  source: {
    hash: string;
    durationSec: number;
    width: number;
    height: number;
    fps: number;
    audioChannels: number;
  };
  transcript: {
    fullText: string;
    segments: Array<{ text: string; start: number; end: number; speaker: string }>;
    words: Array<{ word: string; start: number; end: number; confidence?: number }>;
  };
  audio: {
    sampleIntervalSec: number;
    energySummary: number[];
    meanVolumeDb: number;
    maxVolumeDb: number;
    events: AudioEvent[];
  };
  scenes: {
    events: SceneEvent[];
  };
  speakers: {
    tracks: SpeakerTrack[];
    faceProminenceScore: number;
  };
  extractors: ExtractorManifest;
  createdAt: string;
}

export interface PerceptionRangeResult {
  audio: {
    meanEnergy: number;
    peakEnergy: number;
    events: AudioEvent[];
  };
  scenes: {
    eventCount: number;
    events: SceneEvent[];
  };
  speaker: {
    activeSpeakerId?: string;
    tracks: SpeakerTrack[];
  };
  transcript: {
    text: string;
    words: Array<{ word: string; start: number; end: number; confidence?: number }>;
    segments: Array<{ text: string; start: number; end: number; speaker: string }>;
  };
}

export function queryPerceptionRange(
  snapshot: PerceptionSnapshot,
  startSec: number,
  durationSec: number
): PerceptionRangeResult {
  const endSec = startSec + durationSec;

  const sampleInterval = snapshot.audio.sampleIntervalSec || 0.5;
  const startIdx = Math.max(0, Math.floor(startSec / sampleInterval));
  const endIdx = Math.min(snapshot.audio.energySummary.length, Math.ceil(endSec / sampleInterval));
  const energySlice = snapshot.audio.energySummary.slice(startIdx, endIdx);
  const meanEnergy = energySlice.length > 0 
    ? energySlice.reduce((a, b) => a + b, 0) / energySlice.length 
    : 0;
  const peakEnergy = energySlice.length > 0 ? Math.max(...energySlice) : 0;

  const audioEvents = (snapshot.audio.events || []).filter(
    e => e.endSec >= startSec && e.startSec <= endSec
  );

  const sceneEvents = (snapshot.scenes.events || []).filter(
    s => s.endSec >= startSec && s.startSec <= endSec
  );

  const speakerTracks = (snapshot.speakers.tracks || []).filter(
    t => t.endSec >= startSec && t.startSec <= endSec
  );

  const speakerCounts: Record<string, number> = {};
  for (const t of speakerTracks) {
    speakerCounts[t.speakerId] = (speakerCounts[t.speakerId] || 0) + 1;
  }
  let activeSpeakerId: string | undefined = undefined;
  let maxCount = 0;
  for (const [id, count] of Object.entries(speakerCounts)) {
    if (count > maxCount) {
      maxCount = count;
      activeSpeakerId = id;
    }
  }

  const words = (snapshot.transcript.words || []).filter(
    w => w.end >= startSec && w.start <= endSec
  );
  const segments = (snapshot.transcript.segments || []).filter(
    s => s.end >= startSec && s.start <= endSec
  );
  const text = words.length > 0 
    ? words.map(w => w.word).join(' ') 
    : segments.map(s => s.text).join(' ');

  return {
    audio: {
      meanEnergy,
      peakEnergy,
      events: audioEvents,
    },
    scenes: {
      eventCount: sceneEvents.length,
      events: sceneEvents,
    },
    speaker: {
      activeSpeakerId,
      tracks: speakerTracks,
    },
    transcript: {
      text,
      words,
      segments,
    },
  };
}
