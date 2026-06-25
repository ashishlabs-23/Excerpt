import path from 'path';
import fs from 'fs';
import { NexusSignal } from './NexusRegistry';
import { safeSpawnPython } from '../../lib/safeSpawnPython';

export class FaceTracking {
  /**
   * Runs the nexus_face_score script to determine face prominence.
   * Higher score = more visible and consistent subjects.
   */
  public async getSignal(videoPath: string): Promise<NexusSignal> {
    try {
      const timeout = Number(process.env.EXCERPT_NEXUS_FACE_TIMEOUT_MS || 30000);
      const stdout = await safeSpawnPython('nexus_face_score.py', [videoPath], timeout);
      
      const result = JSON.parse(stdout);
      
      if (result.error) {
        console.warn('[Nexus] FaceTracking script error:', result.error);
        return {
          score: 0.3,
          weight: 0.1,
          reason: result.error,
          status: 'skipped',
          fallback_used: true,
        };
      }

      return {
        score: result.score || 0.1,
        weight: 0.4, // Face prominence is a heavy signal for vertical clips
        reason: result.reason || 'No face metadata',
        status: 'success',
        fallback_used: false,
      };
    } catch (e) {
      console.error('[Nexus] FaceTracking Error:', e);
      return {
        score: 0.5,
        weight: 0,
        reason: 'Face analysis error',
        status: 'skipped',
        fallback_used: true,
      };
    }
  }
}
