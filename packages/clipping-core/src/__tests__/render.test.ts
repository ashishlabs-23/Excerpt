import { RenderPlanValidator } from '../render/RenderPlanValidator';
import { RenderPlanHasher } from '../render/RenderPlanHasher';
import { RenderPlan } from '../render/types';
import { PipelineError, PipelineErrorCode } from '../errors/PipelineError';

describe('Canonical RenderPlan - Core Validation', () => {

  const validPlan: RenderPlan = {
    jobId: 'job-1',
    schemaVersion: '1.0.0',
    candidateId: 'cand-1',
    sourceArtifact: {} as any,
    duration: 10000,
    cameraPlan: {} as any,
    captionPlan: {} as any,
    audioPlan: {} as any,
    thumbnailPlan: {} as any,
    expectedArtifacts: {} as any,
    deliveryPolicy: {} as any,
    renderJobs: [],
    planHash: ''
  };

  it('1. schema validation rejects a plan missing any required field, naming which field', () => {
    const invalidPlan = { ...validPlan };
    delete (invalidPlan as any).captionPlan;

    try {
      RenderPlanValidator.validate(invalidPlan);
      fail('Should have thrown RenderPlanInvalid');
    } catch (e: any) {
      expect(e).toBeInstanceOf(PipelineError);
      expect(e.code).toBe(PipelineErrorCode.RenderPlanInvalid);
      expect(e.message).toContain('captionPlan');
    }
  });

  it('2. version bump on schema change is enforced', () => {
    // If the schemaVersion doesn't match '1.0.0', it should throw.
    const invalidPlan = { ...validPlan, schemaVersion: '1.1.0' };

    try {
      RenderPlanValidator.validate(invalidPlan);
      fail('Should have thrown on unsupported version');
    } catch (e: any) {
      expect(e.code).toBe(PipelineErrorCode.RenderPlanInvalid);
      expect(e.message).toContain('unsupported schemaVersion: 1.1.0');
    }
  });

  it('3. RenderPlanHasher ignores planHash field when hashing', () => {
    const hash1 = RenderPlanHasher.computeHash({ ...validPlan, planHash: 'old-hash' });
    const hash2 = RenderPlanHasher.computeHash({ ...validPlan, planHash: 'different-hash' });
    
    expect(hash1).toBe(hash2);
  });
});
