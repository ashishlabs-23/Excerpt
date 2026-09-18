// storagePolicyConfig.test.ts
// Tests for StoragePolicyConfig constants and utility functions

import {
  STORAGE_QUOTA_BYTES,
  STORAGE_EVICTION_WARNING_BYTES,
  STORAGE_EVICTION_TRIGGER_BYTES,
  STORAGE_ADMISSION_BYTES,
  STORAGE_TARGET_BYTES,
  STORAGE_CRITICAL_BYTES,
  classifyPressure,
  getStoragePolicyConfigSummary,
  PressureLevel,
} from '../services/StoragePolicyConfig';

describe('StoragePolicyConfig', () => {
  describe('Default byte constants', () => {
    it('STORAGE_QUOTA_BYTES defaults to 1 GiB', () => {
      expect(STORAGE_QUOTA_BYTES).toBe(1_073_741_824);
    });

    it('WARNING threshold is below EVICTION threshold', () => {
      expect(STORAGE_EVICTION_WARNING_BYTES).toBeLessThan(STORAGE_EVICTION_TRIGGER_BYTES);
    });

    it('TARGET is below WARNING (hysteresis band)', () => {
      expect(STORAGE_TARGET_BYTES).toBeLessThan(STORAGE_EVICTION_WARNING_BYTES);
    });

    it('EVICTION threshold is below ADMISSION ceiling', () => {
      expect(STORAGE_EVICTION_TRIGGER_BYTES).toBeLessThan(STORAGE_ADMISSION_BYTES);
    });

    it('ADMISSION ceiling is below CRITICAL', () => {
      expect(STORAGE_ADMISSION_BYTES).toBeLessThan(STORAGE_CRITICAL_BYTES);
    });

    it('CRITICAL does not exceed QUOTA', () => {
      expect(STORAGE_CRITICAL_BYTES).toBeLessThan(STORAGE_QUOTA_BYTES);
    });

    it('percentage thresholds are approximately correct', () => {
      const warnPct = STORAGE_EVICTION_WARNING_BYTES / STORAGE_QUOTA_BYTES;
      const evictPct = STORAGE_EVICTION_TRIGGER_BYTES / STORAGE_QUOTA_BYTES;
      const admitPct = STORAGE_ADMISSION_BYTES / STORAGE_QUOTA_BYTES;
      const critPct = STORAGE_CRITICAL_BYTES / STORAGE_QUOTA_BYTES;
      const targetPct = STORAGE_TARGET_BYTES / STORAGE_QUOTA_BYTES;

      expect(warnPct).toBeCloseTo(0.75, 1);
      expect(evictPct).toBeCloseTo(0.85, 1);
      expect(admitPct).toBeCloseTo(0.90, 1);
      expect(critPct).toBeCloseTo(0.95, 1);
      expect(targetPct).toBeCloseTo(0.65, 1);
    });
  });

  describe('classifyPressure()', () => {
    it('returns NORMAL for zero usage', () => {
      expect(classifyPressure(0)).toBe('NORMAL');
    });

    it('returns NORMAL for usage below WARNING threshold', () => {
      expect(classifyPressure(STORAGE_EVICTION_WARNING_BYTES - 1)).toBe('NORMAL');
    });

    it('returns WARNING at the WARNING threshold (inclusive)', () => {
      expect(classifyPressure(STORAGE_EVICTION_WARNING_BYTES)).toBe('WARNING');
    });

    it('returns WARNING between WARNING and EVICTION thresholds', () => {
      const mid = Math.floor((STORAGE_EVICTION_WARNING_BYTES + STORAGE_EVICTION_TRIGGER_BYTES) / 2);
      expect(classifyPressure(mid)).toBe('WARNING');
    });

    it('returns EVICTION at the EVICTION threshold (inclusive)', () => {
      expect(classifyPressure(STORAGE_EVICTION_TRIGGER_BYTES)).toBe('EVICTION');
    });

    it('returns EVICTION between EVICTION and CRITICAL thresholds', () => {
      const mid = Math.floor((STORAGE_EVICTION_TRIGGER_BYTES + STORAGE_CRITICAL_BYTES) / 2);
      expect(classifyPressure(mid)).toBe('EVICTION');
    });

    it('returns CRITICAL at the CRITICAL threshold (inclusive)', () => {
      expect(classifyPressure(STORAGE_CRITICAL_BYTES)).toBe('CRITICAL');
    });

    it('returns CRITICAL above quota', () => {
      expect(classifyPressure(STORAGE_QUOTA_BYTES + 1)).toBe('CRITICAL');
    });

    // Boundary: 1 byte below each threshold
    it('NORMAL: 1 byte below WARNING', () => {
      expect(classifyPressure(STORAGE_EVICTION_WARNING_BYTES - 1)).toBe('NORMAL');
    });
    it('WARNING: 1 byte below EVICTION', () => {
      expect(classifyPressure(STORAGE_EVICTION_TRIGGER_BYTES - 1)).toBe('WARNING');
    });
    it('EVICTION: 1 byte below CRITICAL', () => {
      expect(classifyPressure(STORAGE_CRITICAL_BYTES - 1)).toBe('EVICTION');
    });
  });

  describe('getStoragePolicyConfigSummary()', () => {
    it('returns an object with required keys', () => {
      const summary = getStoragePolicyConfigSummary();
      expect(summary).toHaveProperty('quota');
      expect(summary).toHaveProperty('warning');
      expect(summary).toHaveProperty('eviction_trigger');
      expect(summary).toHaveProperty('eviction_target');
      expect(summary).toHaveProperty('critical');
      expect(summary).toHaveProperty('grace_period_ms');
      expect(summary).toHaveProperty('expiration_processing_hours');
    });

    it('returns string values (for JSON serialisation safety)', () => {
      const summary = getStoragePolicyConfigSummary();
      for (const [key, value] of Object.entries(summary)) {
        expect(typeof value).toBe('string');
      }
    });

    it('includes MB label in byte values', () => {
      const summary = getStoragePolicyConfigSummary();
      expect(summary.quota).toContain('MB');
    });
  });
});
