import { describe, it, expect } from 'vitest';
import { createRenderPlan, DeliveryValidator } from '../src';

describe('RenderPlan Contract & DeliveryValidator', () => {
  it('creates a RenderPlan contract correctly from accepted clips', () => {
    const plan = createRenderPlan({
      jobId: 'job_123',
      requestedClips: 5,
      acceptedClips: [{ id: 'clip_1' }, { id: 'clip_2' }],
    });

    expect(plan.jobId).toBe('job_123');
    expect(plan.requestedClips).toBe(5);
    expect(plan.acceptedCandidates).toBe(2);
    expect(plan.renderJobs.length).toBe(2);
    expect(plan.expectedArtifacts).toBe(4);
    expect(plan.deliveryPolicy.minSuccessfulClips).toBe(1);
  });

  it('validates delivery funnel report correctly when all clips pass', () => {
    const plan = createRenderPlan({
      jobId: 'job_456',
      requestedClips: 3,
      acceptedClips: [{ id: 'clip_1' }, { id: 'clip_2' }],
    });

    const report = DeliveryValidator.validate(plan, [
      { clipId: 'clip_1', videoUrl: 'https://b2.com/c1.mp4', thumbnailUrl: 'https://b2.com/c1.jpg', isPlayable: true, storageVerified: true },
      { clipId: 'clip_2', videoUrl: 'https://b2.com/c2.mp4', thumbnailUrl: 'https://b2.com/c2.jpg', isPlayable: true, storageVerified: true },
    ]);

    expect(report.requested).toBe(3);
    expect(report.accepted).toBe(2);
    expect(report.scheduled).toBe(2);
    expect(report.rendered).toBe(2);
    expect(report.uploaded).toBe(2);
    expect(report.playable).toBe(2);
    expect(report.pass).toBe(true);
  });

  it('fails delivery validation if playable clips is 0', () => {
    const plan = createRenderPlan({
      jobId: 'job_789',
      requestedClips: 3,
      acceptedClips: [{ id: 'clip_1' }],
    });

    const report = DeliveryValidator.validate(plan, []);

    expect(report.playable).toBe(0);
    expect(report.pass).toBe(false);
    expect(report.reason).toContain('Delivery validation failed');
  });
});
