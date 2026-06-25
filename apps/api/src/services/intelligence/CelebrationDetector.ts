import { safeSpawnPython } from '../../lib/safeSpawnPython';
import { DetectedEvent, PipelineContext } from './PipelineContext';
import { isMultiModalEnabled } from '../../config/features';

export class CelebrationDetector {
  public async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const start = Date.now();
    
    // Check if celebration analysis is enabled (we treat as enabled if master is on, or if we have a flag)
    if (!isMultiModalEnabled('event_engine')) {
      return [];
    }

    try {
      console.log(`[CelebrationDetector]: Spawning python pose estimator on '${videoPath}'...`);
      const stdout = await safeSpawnPython('celebration_detector.py', [videoPath], 60000);
      
      const rawPoints: { timestamp: number; score: number; class: string }[] = JSON.parse(stdout);
      
      const events: DetectedEvent[] = [];
      let currentEvent: DetectedEvent | null = null;

      for (const pt of rawPoints.sort((a, b) => a.timestamp - b.timestamp)) {
        if (!currentEvent) {
          currentEvent = {
            type: 'celebration',
            confidence: pt.score,
            start: Math.max(0, pt.timestamp - 1.5),
            end: pt.timestamp + 1.5,
            signals: { pose_score: pt.score },
            adapter: 'celebration_detector',
          };
        } else if (pt.timestamp - currentEvent.end <= 3.0) {
          currentEvent.end = pt.timestamp + 1.5;
          currentEvent.confidence = Math.max(currentEvent.confidence, pt.score);
          currentEvent.signals.pose_score = Math.max(currentEvent.signals.pose_score, pt.score);
        } else {
          events.push(currentEvent);
          currentEvent = {
            type: 'celebration',
            confidence: pt.score,
            start: Math.max(0, pt.timestamp - 1.5),
            end: pt.timestamp + 1.5,
            signals: { pose_score: pt.score },
            adapter: 'celebration_detector',
          };
        }
      }

      if (currentEvent) {
        events.push(currentEvent);
      }

      context.executionTimes['CelebrationDetector'] = Date.now() - start;
      console.log(`[CelebrationDetector]: Completed. Detected ${events.length} celebrations.`);
      return events;
    } catch (err: any) {
      console.warn(`[CelebrationDetector]: Warning: Python celebration detector bypassed. ${err.message}`);
      context.executionTimes['CelebrationDetector'] = Date.now() - start;
      return [];
    }
  }
}
