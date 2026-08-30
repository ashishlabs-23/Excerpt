import { BaseEngine } from './BaseEngine';
import { MediaArtifact, PerceptionEngineConfig } from '@excerpt/clipping-core';

export class WhisperXEngine extends BaseEngine<any[]> {
  public readonly engineName = 'WhisperX';
  public readonly engineVersion = 'v3.0.0';
  public readonly isMandatory = true; // MUST SUCCEED
  protected readonly estimatedCostUsdPerMinute = 0.006;

  protected async executeInference(artifact: MediaArtifact, config: PerceptionEngineConfig): Promise<any[]> {
    // Mocking actual WhisperX call
    return [
      { word: 'Hello', startMs: 0, endMs: 500 },
      { word: 'world', startMs: 500, endMs: 1000 }
    ];
  }
}

export class PyannoteEngine extends BaseEngine<any[]> {
  public readonly engineName = 'Pyannote';
  public readonly engineVersion = 'v3.1.1';
  public readonly isMandatory = true; // MUST SUCCEED
  protected readonly estimatedCostUsdPerMinute = 0.002;

  protected async executeInference(artifact: MediaArtifact, config: PerceptionEngineConfig): Promise<any[]> {
    // Mocking Pyannote Diarization
    return [
      { speaker: 'SPEAKER_00', startMs: 0, endMs: 1000, confidence: 0.95 }
    ];
  }
}

export class YOLOEngine extends BaseEngine<any[]> {
  public readonly engineName = 'YOLOv8';
  public readonly engineVersion = 'v8.0.0';
  public readonly isMandatory = false; // OPTIONAL
  protected readonly estimatedCostUsdPerMinute = 0.01;

  protected async executeInference(artifact: MediaArtifact, config: PerceptionEngineConfig): Promise<any[]> {
    // Mocking YOLO object detection
    return [
      { timestampMs: 500, objects: ['person', 'car'], persons: [{ box: [0,0,10,10] }] }
    ];
  }
}
