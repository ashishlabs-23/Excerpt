import { TemporalConsistencyEngine } from '../../services/intelligence/TemporalConsistencyEngine';

describe('TemporalConsistencyEngine: Cinematic Hard-Cut vs Pan Rules', () => {
  let engine: TemporalConsistencyEngine;

  beforeEach(() => {
    engine = new TemporalConsistencyEngine();
  });

  it('1. Deadband Rule: micro-movement under 8% is locked to eliminate jitter', () => {
    const prev = { x: 0.50, y: 0.50 };
    const prop = { x: 0.54, y: 0.53 }; // dx = 0.04, dy = 0.03 <= 0.08

    const result = engine.stabilizeFocalPoint(prev, prop);

    expect(result.transition).toBe('locked');
    expect(result.x).toBe(0.50);
    expect(result.y).toBe(0.50);
  });

  it('2. Smooth Pan Rule: moderate movement between 8% and 18% is smoothly interpolated', () => {
    const prev = { x: 0.50, y: 0.50 };
    const prop = { x: 0.62, y: 0.50 }; // dx = 0.12 (in 8-18% range)

    const result = engine.stabilizeFocalPoint(prev, prop);

    expect(result.transition).toBe('smooth_pan');
    expect(result.x).toBeGreaterThan(0.50);
    expect(result.x).toBeLessThan(0.62);
  });

  it('3. Hard-Cut Rule: large speaker shift (>= 18%) snaps directly without panning', () => {
    const prev = { x: 0.25, y: 0.40 }; // Speaker A (left)
    const prop = { x: 0.75, y: 0.40 }; // Speaker B (right, dx = 0.50 >= 0.18)

    const result = engine.stabilizeFocalPoint(prev, prop);

    expect(result.transition).toBe('hard_cut');
    expect(result.x).toBe(0.75);
    expect(result.y).toBe(0.40);
  });
});
