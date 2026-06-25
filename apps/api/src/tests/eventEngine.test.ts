import { EventEngine } from '../services/intelligence/EventEngine';
import { AdapterRegistry } from '../services/intelligence/AdapterRegistry';
import { CategoryAdapter, EventDetector } from '../services/intelligence/adapters/BaseAdapter';
import { createDefaultContext, DetectedEvent } from '../services/intelligence/PipelineContext';
import { isMultiModalEnabled } from '../config/features';

jest.mock('../config/features', () => {
  const original = jest.requireActual('../config/features');
  return {
    __esModule: true,
    ...original,
    isMultiModalEnabled: jest.fn(),
  };
});

class MockAdapter extends CategoryAdapter {
  readonly category: string;
  private detectors: EventDetector[];

  constructor(category: string, detectors: EventDetector[] = []) {
    super();
    this.category = category;
    this.detectors = detectors;
  }

  getDetectors(): EventDetector[] {
    return this.detectors;
  }

  getClipBoundaryRules() {
    return [];
  }

  getRankingProfile() {
    return {};
  }

  getThumbnailPriority() {
    return [];
  }
}

describe('EventEngine', () => {
  let registry: AdapterRegistry;
  let eventEngine: EventEngine;
  let mockIsMultiModalEnabled: jest.MockedFunction<typeof isMultiModalEnabled>;

  beforeEach(() => {
    registry = AdapterRegistry.getInstance();
    registry.clear();
    eventEngine = new EventEngine(registry);
    mockIsMultiModalEnabled = isMultiModalEnabled as jest.MockedFunction<typeof isMultiModalEnabled>;
    mockIsMultiModalEnabled.mockReturnValue(true); // Default to enabled for most tests
  });

  it('returns empty list if event_engine feature flag is disabled', async () => {
    mockIsMultiModalEnabled.mockImplementation((feature) => {
      if (feature === 'event_engine') return false;
      return true;
    });

    const context = createDefaultContext('job-123');
    context.category.category = 'football';

    const mockDetector: EventDetector = {
      name: 'MockGoalDetector',
      detect: jest.fn().mockResolvedValue([{ type: 'goal', confidence: 0.9, start: 10, end: 15 }]),
    };
    registry.register(new MockAdapter('football', [mockDetector]));

    const events = await eventEngine.detect('/path/to/video.mp4', context);
    expect(events).toEqual([]);
    expect(mockDetector.detect).not.toHaveBeenCalled();
  });

  it('returns empty list if no adapter is registered for the category', async () => {
    const context = createDefaultContext('job-123');
    context.category.category = 'football'; // No football adapter registered

    const events = await eventEngine.detect('/path/to/video.mp4', context);
    expect(events).toEqual([]);
  });

  it('runs all detectors in parallel and merges their events', async () => {
    const context = createDefaultContext('job-123');
    context.category.category = 'football';

    const detector1: EventDetector = {
      name: 'GoalDetector',
      detect: jest.fn().mockResolvedValue([
        { type: 'goal', confidence: 0.9, start: 10, end: 15, signals: {}, adapter: 'football' }
      ]),
    };

    const detector2: EventDetector = {
      name: 'CardDetector',
      detect: jest.fn().mockResolvedValue([
        { type: 'red_card', confidence: 0.8, start: 45, end: 50, signals: {}, adapter: 'football' }
      ]),
    };

    registry.register(new MockAdapter('football', [detector1, detector2]));

    const events = await eventEngine.detect('/path/to/video.mp4', context);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('goal');
    expect(events[1].type).toBe('red_card');
    expect(context.events).toEqual(events);
    expect(context.executionTimes['EventEngine']).toBeDefined();
  });

  it('handles detector failure gracefully without crashing the whole process', async () => {
    const context = createDefaultContext('job-123');
    context.category.category = 'football';

    const failingDetector: EventDetector = {
      name: 'FailingDetector',
      detect: jest.fn().mockRejectedValue(new Error('Subprocess crash')),
    };

    const workingDetector: EventDetector = {
      name: 'WorkingDetector',
      detect: jest.fn().mockResolvedValue([
        { type: 'goal', confidence: 0.95, start: 20, end: 25, signals: {}, adapter: 'football' }
      ]),
    };

    registry.register(new MockAdapter('football', [failingDetector, workingDetector]));

    const events = await eventEngine.detect('/path/to/video.mp4', context);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('goal');
  });

  describe('Deduplication logic (1D Temporal IoU)', () => {
    it('keeps both events if overlap IoU is less than 0.5', async () => {
      const context = createDefaultContext('job-123');
      context.category.category = 'football';

      const d1: EventDetector = {
        name: 'D1',
        detect: jest.fn().mockResolvedValue([
          { type: 'goal', confidence: 0.9, start: 10, end: 20, signals: {}, adapter: 'football' }
        ]),
      };

      const d2: EventDetector = {
        name: 'D2',
        detect: jest.fn().mockResolvedValue([
          { type: 'crowd_surge', confidence: 0.8, start: 15, end: 25, signals: {}, adapter: 'football' }
        ]),
      };

      // IoU = 5 / 15 = 0.333 < 0.5 -> Keep both
      registry.register(new MockAdapter('football', [d1, d2]));

      const events = await eventEngine.detect('/path/to/video.mp4', context);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('goal');
      expect(events[1].type).toBe('crowd_surge');
    });

    it('deduplicates event with lower confidence when IoU is >= 0.5 (inner overlap)', async () => {
      const context = createDefaultContext('job-123');
      context.category.category = 'football';

      const d1: EventDetector = {
        name: 'D1',
        detect: jest.fn().mockResolvedValue([
          { type: 'goal', confidence: 0.9, start: 10, end: 20, signals: {}, adapter: 'football' }
        ]),
      };

      const d2: EventDetector = {
        name: 'D2',
        detect: jest.fn().mockResolvedValue([
          { type: 'crowd_surge', confidence: 0.8, start: 12, end: 18, signals: {}, adapter: 'football' }
        ]),
      };

      // IoU = 6 / 10 = 0.6 >= 0.5 -> Deduplicate crowd_surge (conf 0.8 < 0.9)
      registry.register(new MockAdapter('football', [d1, d2]));

      const events = await eventEngine.detect('/path/to/video.mp4', context);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('goal');
      expect(events[0].confidence).toBe(0.9);
    });

    it('deduplicates event with lower confidence even if the lower confidence event starts first', async () => {
      const context = createDefaultContext('job-123');
      context.category.category = 'football';

      const d1: EventDetector = {
        name: 'D1',
        detect: jest.fn().mockResolvedValue([
          { type: 'crowd_surge', confidence: 0.7, start: 10, end: 20, signals: {}, adapter: 'football' }
        ]),
      };

      const d2: EventDetector = {
        name: 'D2',
        detect: jest.fn().mockResolvedValue([
          { type: 'goal', confidence: 0.9, start: 12, end: 18, signals: {}, adapter: 'football' }
        ]),
      };

      // IoU = 6 / 10 = 0.6 >= 0.5 -> Keep goal (conf 0.9), discard crowd_surge (conf 0.7)
      registry.register(new MockAdapter('football', [d1, d2]));

      const events = await eventEngine.detect('/path/to/video.mp4', context);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('goal');
      expect(events[0].confidence).toBe(0.9);
    });

    it('sorts the final events chronologically (by start time)', async () => {
      const context = createDefaultContext('job-123');
      context.category.category = 'football';

      const d1: EventDetector = {
        name: 'D1',
        detect: jest.fn().mockResolvedValue([
          { type: 'goal', confidence: 0.9, start: 40, end: 45, signals: {}, adapter: 'football' },
          { type: 'red_card', confidence: 0.95, start: 10, end: 15, signals: {}, adapter: 'football' }
        ]),
      };

      registry.register(new MockAdapter('football', [d1]));

      const events = await eventEngine.detect('/path/to/video.mp4', context);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('red_card');
      expect(events[0].start).toBe(10);
      expect(events[1].type).toBe('goal');
      expect(events[1].start).toBe(40);
    });
  });
});
