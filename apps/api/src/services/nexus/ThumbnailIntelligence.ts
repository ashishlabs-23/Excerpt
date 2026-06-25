import path from 'path';
import fs from 'fs';
import { NexusSignal } from './NexusRegistry';
import { safeSpawnPython } from '../../lib/safeSpawnPython';

export class ThumbnailIntelligence {
  /**
   * Orchestrates the local Python script to pick the best thumbnail.
   */
  public async getSignal(videoPath: string): Promise<NexusSignal> {
    const outputDir = path.dirname(videoPath);
    try {
      const timeout = Number(process.env.EXCERPT_NEXUS_THUMBNAIL_TIMEOUT_MS || 30000);
      const stdout = await safeSpawnPython('thumbnail_select.py', [videoPath, outputDir], timeout);

        const isSuccess = stdout.includes('SUCCESS');
        const scoreMatch = stdout.match(/Score ([\d.]+)/);
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0.5;

        // Normalize score (OpenCV scores can be high, we map them to 0-1 range roughly)
        const normalizedScore = Math.min(1.0, score / 1500); 

        return {
          score: normalizedScore,
          weight: 0.1, // Small weight for the global score, but high utility for the UI
          reason: isSuccess ? 'Optimal thumbnail selected locally.' : 'Default thumbnail used.',
          status: isSuccess ? 'success' : 'skipped',
          fallback_used: !isSuccess,
        };
    } catch (error) {
      console.error('[Nexus] Thumbnail selection failed:', error);
      return {
        score: 0,
        weight: 0,
        reason: 'Thumbnail extraction failed.',
        status: 'skipped',
        fallback_used: true,
      };
    }
  }
}
