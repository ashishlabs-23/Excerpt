import { 
  ALL_VIDEO_JOB_STATUSES, 
  JOB_STATUS_MAP, 
  getJobStatusMeta 
} from '../lib/jobStatus';
import { VideoJobStatus } from '@excerpt/clipping-core';

describe('Job Status UI Contract', () => {
  it('1. every VideoJobStatus value from backend has a defined entry in JOB_STATUS_MAP', () => {
    ALL_VIDEO_JOB_STATUSES.forEach((status: VideoJobStatus) => {
      const meta = getJobStatusMeta(status);
      expect(meta).toBeDefined();
      expect(meta.status).toBe(status);
      expect(meta.label).not.toBe(status); // Must be human readable, not raw enum
      expect(meta.category).toBeDefined();
      expect(meta.variant).toBeDefined();
    });
  });

  it('2. completed vs completed:partial render visibly different badges and categories', () => {
    const completedMeta = getJobStatusMeta('completed');
    const partialMeta = getJobStatusMeta('completed:partial');

    // Category Assertion
    expect(completedMeta.category).toBe('success');
    expect(partialMeta.category).toBe('partial_success');
    expect(completedMeta.category).not.toBe(partialMeta.category);

    // Variant / Badge Color Assertion
    expect(completedMeta.variant).toBe('success'); // Green
    expect(partialMeta.variant).toBe('warning');   // Amber
    expect(completedMeta.variant).not.toBe(partialMeta.variant);

    // Label Assertion
    expect(completedMeta.label).toBe('All Clips Ready');
    expect(partialMeta.label).toBe('Partial Delivery');
  });

  it('3. dead_letter maps to needs_attention category, distinct from ordinary failures', () => {
    const deadLetterMeta = getJobStatusMeta('dead_letter');
    const ordinaryFailureMeta = getJobStatusMeta('failed:download');

    expect(deadLetterMeta.category).toBe('needs_attention');
    expect(ordinaryFailureMeta.category).toBe('failure');

    expect(deadLetterMeta.variant).toBe('attention'); // Purple alert
    expect(ordinaryFailureMeta.variant).toBe('error');    // Red error
  });
});
