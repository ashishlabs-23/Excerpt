import { CrowdExcitementEngine } from '../services/intelligence/CrowdExcitementEngine';
import { createDefaultContext } from '../services/intelligence/PipelineContext';
import { isMultiModalEnabled } from '../config/features';

jest.mock('../config/features', () => {
  const original = jest.requireActual('../config/features');
  return {
    __esModule: true,
    ...original,
    isMultiModalEnabled: jest.fn(),
  };
});

describe('CrowdExcitementEngine', () => {
  let engine: CrowdExcitementEngine;
  let mockIsMultiModalEnabled: jest.MockedFunction<typeof isMultiModalEnabled>;

  beforeEach(() => {
    engine = new CrowdExcitementEngine();
    mockIsMultiModalEnabled = isMultiModalEnabled as jest.MockedFunction<typeof isMultiModalEnabled>;
    mockIsMultiModalEnabled.mockReturnValue(true);
  });

  it('respects the crowd_engine feature flag', async () => {
    mockIsMultiModalEnabled.mockImplementation((feature) => {
      if (feature === 'crowd_engine') return false;
      return true;
    });

    const context = createDefaultContext('job-123');
    const timeline = await engine.generateTimeline('dummy.mp4', context);
    expect(timeline).toEqual([]);
  });

  it('correctly parses simulated FFmpeg astats output and detects spikes', () => {
    // Simulated output with background noise (-30dB) and a spike (-10dB) around t=5
    const simulatedStderr = `
frame:1    pts:0       t:0.000000
lavfi.astats.Overall.RMS_level=-30.000000
frame:30   pts:90000   t:1.000000
lavfi.astats.Overall.RMS_level=-30.500000
frame:60   pts:180000  t:2.000000
lavfi.astats.Overall.RMS_level=-30.000000
frame:90   pts:270000  t:3.000000
lavfi.astats.Overall.RMS_level=-29.800000
frame:120  pts:360000  t:4.000000
lavfi.astats.Overall.RMS_level=-30.000000
frame:150  pts:450000  t:5.000000
lavfi.astats.Overall.RMS_level=-10.000000
frame:180  pts:540000  t:6.000000
lavfi.astats.Overall.RMS_level=-12.000000
frame:210  pts:630000  t:7.000000
lavfi.astats.Overall.RMS_level=-30.000000
`;

    // Access private parseAstats method via casting
    const timeline = (engine as any).parseAstats(simulatedStderr);

    expect(timeline).toHaveLength(8); // t=0 to t=7
    
    // t=0 to t=4 should be calm
    for (let i = 0; i <= 4; i++) {
      expect(timeline[i].label).toBe('calm');
    }

    // t=5 should have a massive spike (eruption)
    expect(timeline[5].timestamp).toBe(5);
    expect(timeline[5].label).toBe('eruption');
    expect(timeline[5].score).toBeGreaterThan(60);

    // t=6 should still be high
    expect(timeline[6].timestamp).toBe(6);
    expect(timeline[6].label).toBe('eruption');

    // t=7 should go back to calm
    expect(timeline[7].timestamp).toBe(7);
    expect(timeline[7].label).toBe('calm');
  });
});
