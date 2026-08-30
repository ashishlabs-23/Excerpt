import { RenderPlan } from './types';
import crypto from 'crypto';

export class RenderPlanHasher {
  /**
   * Computes the SHA-256 hash of the RenderPlan, explicitly ignoring the `planHash` field.
   * This guarantees that plans with identical configurations map to the same hash for idempotency.
   */
  static computeHash(plan: Omit<RenderPlan, 'planHash'> | RenderPlan): string {
    // Create a copy of the object and delete the planHash field if it exists
    const canonical = { ...plan };
    delete (canonical as any).planHash;

    // Stable stringify using a deterministic replacement logic if needed, 
    // but for now standard stringify (assuming key ordering is maintained by TS)
    // To be perfectly stable, keys should be sorted, but simple stringify works for tests.
    
    // Sort keys for deterministic JSON serialization
    const stableStringify = (obj: any): string => {
      if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
      }
      if (Array.isArray(obj)) {
        return `[${obj.map(item => stableStringify(item)).join(',')}]`;
      }
      const keys = Object.keys(obj).sort();
      const str = keys.map(k => `"${k}":${stableStringify(obj[k])}`).join(',');
      return `{${str}}`;
    };

    const serialized = stableStringify(canonical);
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }
}
