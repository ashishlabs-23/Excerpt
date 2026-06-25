import { DetectedEvent, PipelineContext } from './PipelineContext';
import { AdapterRegistry } from './AdapterRegistry';
import { isMultiModalEnabled } from '../../config/features';

export class EventEngine {
  private registry: AdapterRegistry;

  constructor(registry: AdapterRegistry = AdapterRegistry.getInstance()) {
    this.registry = registry;
  }

  public async detect(videoPath: string, context: PipelineContext): Promise<DetectedEvent[]> {
    const start = Date.now();
    
    // 1. Guard check feature flag
    if (!isMultiModalEnabled('event_engine')) {
      console.log(`[EventEngine]: Event Engine disabled via feature flag.`);
      context.executionTimes['EventEngine'] = Date.now() - start;
      return [];
    }

    const category = context.category.category;
    const adapter = this.registry.getAdapter(category);
    if (!adapter) {
      console.log(`[EventEngine]: No CategoryAdapter registered for category '${category}'. Skipping event detection.`);
      context.executionTimes['EventEngine'] = Date.now() - start;
      return [];
    }

    console.log(`[EventEngine]: Running Event Engine for category '${category}' using adapter '${adapter.constructor.name}'...`);
    const detectors = adapter.getDetectors();
    if (detectors.length === 0) {
      console.log(`[EventEngine]: No detectors registered for adapter '${adapter.constructor.name}'.`);
      context.executionTimes['EventEngine'] = Date.now() - start;
      return [];
    }

    try {
      // 2. Run all detectors in parallel
      const detectionPromises = detectors.map(async (detector) => {
        try {
          const detStart = Date.now();
          const events = await detector.detect(videoPath, context);
          console.log(`[EventEngine]: Detector '${detector.name}' found ${events.length} events (${Date.now() - detStart}ms)`);
          return events;
        } catch (err) {
          console.error(`[EventEngine]: Detector '${detector.name}' failed:`, err);
          return [];
        }
      });

      const results = await Promise.all(detectionPromises);
      const allEvents = results.flat();

      // 3. Deduplicate overlapping events
      const deduplicatedEvents = this.deduplicate(allEvents);

      // 4. Sort by confidence descending (the return value is sorted chronologically, but we sorted by confidence for deduplication)
      context.events = deduplicatedEvents;
      
      const duration = Date.now() - start;
      context.executionTimes['EventEngine'] = duration;
      console.log(`[EventEngine]: Event detection completed. Found ${deduplicatedEvents.length} unique events in ${duration}ms.`);
      
      return deduplicatedEvents;
    } catch (err) {
      console.error(`[EventEngine]: Critical failure during event detection:`, err);
      context.executionTimes['EventEngine'] = Date.now() - start;
      return [];
    }
  }

  /**
   * Deduplicates events based on 1D temporal Intersection over Union (IoU) with a threshold of 0.5.
   * Keeps the higher confidence event when overlap occurs.
   */
  private deduplicate(events: DetectedEvent[]): DetectedEvent[] {
    if (events.length <= 1) {
      return [...events];
    }

    // Sort by confidence descending so we evaluate higher confidence events first
    const sorted = [...events].sort((a, b) => b.confidence - a.confidence);
    const selected: DetectedEvent[] = [];

    for (const event of sorted) {
      let keep = true;
      for (const alreadySelected of selected) {
        const iou = this.calculateIoU(event, alreadySelected);
        if (iou >= 0.5) {
          keep = false;
          console.log(
            `[EventEngine]: Deduplicated event '${event.type}' (${event.start.toFixed(1)}s-${event.end.toFixed(1)}s, conf: ${event.confidence.toFixed(2)}) overlapping with '${alreadySelected.type}' (${alreadySelected.start.toFixed(1)}s-${alreadySelected.end.toFixed(1)}s, conf: ${alreadySelected.confidence.toFixed(2)}) (IoU: ${iou.toFixed(3)})`
          );
          break;
        }
      }
      if (keep) {
        selected.push(event);
      }
    }

    // Sort back chronologically for nice pipeline sequencing
    return selected.sort((a, b) => a.start - b.start);
  }

  /**
   * Calculates the 1D temporal Intersection over Union (IoU) of two events.
   */
  private calculateIoU(a: DetectedEvent, b: DetectedEvent): number {
    const startMax = Math.max(a.start, b.start);
    const endMin = Math.min(a.end, b.end);
    const intersection = Math.max(0, endMin - startMax);

    if (intersection === 0) {
      return 0;
    }

    const durationA = a.end - a.start;
    const durationB = b.end - b.start;
    const union = durationA + durationB - intersection;

    if (union <= 0) {
      return 0;
    }

    return intersection / union;
  }
}
