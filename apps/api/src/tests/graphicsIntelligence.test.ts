import { createDefaultContext } from '../services/intelligence/PipelineContext';
import { broadcastGraphicsDetector } from '../services/intelligence/BroadcastGraphicsDetector';
import { protectClipBoundaries } from '../services/pipelineUtils';

describe('Broadcast Graphics & Gameplay Density Engines', () => {
  it('correctly calculates graphic OCR keyword scores', () => {
    const text = 'MATCHDAY GROUP F LINEUP';
    const score = broadcastGraphicsDetector.calculateGraphicKeywordScore(text);
    expect(score).toBe(90);
  });

  it('correctly computes gameplay density based on visual elements', () => {
    const frame = {
      second: 0,
      detected: false,
      confidence: 0.05,
      graphic_type: 'none',
      text_density: 0.05,
      motion_score: 0.85,
      field_visible: true,
      field_confidence: 0.95,
      player_count: 22,
      player_density: 0.85,
      ocr_text: ''
    };

    const density = broadcastGraphicsDetector.calculateGameplayDensity(frame);
    expect(density).toBeGreaterThan(80);
  });

  it('applies graphics penalty correctly on overlay or full screen cards', () => {
    const frame = {
      second: 0,
      detected: true,
      confidence: 0.95,
      graphic_type: 'match_intro',
      text_density: 0.55,
      motion_score: 0.02,
      field_visible: false,
      field_confidence: 0.1,
      player_count: 0,
      player_density: 0,
      ocr_text: 'MATCHDAY LINEUP'
    };

    const ocrScore = broadcastGraphicsDetector.calculateGraphicKeywordScore(frame.ocr_text);
    const penalty = broadcastGraphicsDetector.calculateGraphicPenalty(frame, ocrScore);
    expect(penalty).toBe(-80);
  });

  it('classifies visual segments into sports/vlog categories', () => {
    const frame = {
      second: 0,
      detected: true,
      confidence: 0.95,
      graphic_type: 'match_intro',
      text_density: 0.55,
      motion_score: 0.02,
      field_visible: false,
      field_confidence: 0.1,
      player_count: 0,
      player_density: 0,
      ocr_text: 'MATCHDAY LINEUP'
    };

    const ocrScore = broadcastGraphicsDetector.calculateGraphicKeywordScore(frame.ocr_text);
    const segment = broadcastGraphicsDetector.classifySegment(frame, ocrScore, 10);
    expect(segment).toBe('graphic');
  });

  it('protects clip boundaries from starting or ending on graphics', () => {
    const context = createDefaultContext('boundary-job');
    context.visualTimeline = [
      { second: 0, segment_type: 'graphic', gameplay_density: 10, text_density: 0.5, motion_score: 0.01 },
      { second: 1, segment_type: 'graphic', gameplay_density: 10, text_density: 0.5, motion_score: 0.01 },
      { second: 2, segment_type: 'graphic', gameplay_density: 10, text_density: 0.5, motion_score: 0.01 },
      { second: 5, segment_type: 'gameplay', gameplay_density: 90, text_density: 0.05, motion_score: 0.8 },
      { second: 10, segment_type: 'gameplay', gameplay_density: 90, text_density: 0.05, motion_score: 0.8 },
      { second: 15, segment_type: 'graphic', gameplay_density: 10, text_density: 0.5, motion_score: 0.01 }
    ];

    const adjusted = protectClipBoundaries(0, 15, context);
    expect(adjusted.start).toBe(3);
    expect(adjusted.end).toBe(12);
  });
});
