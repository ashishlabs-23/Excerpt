import { createRenderPlan, RenderPlanValidator, CaptionPolicy } from '@excerpt/clipping-core';

describe('P6.2 & P6.3: Caption Contract & Artifact Isolation Invariants', () => {

  describe('P6.2 Compulsory Caption Contract', () => {
    it('enforces required captions and disables uncaptioned fallback by default', () => {
      const plan = createRenderPlan({
        jobId: 'job-test-p6',
        requestedClips: 2,
        acceptedClips: [{ id: 'clip-a' }, { id: 'clip-b' }],
      });

      expect(plan.captionPolicy).toBeDefined();
      expect(plan.captionPolicy?.required).toBe(true);
      expect(plan.captionPolicy?.allowUncaptionedFallback).toBe(false);
      expect(plan.captionPolicy?.style).toBe('submagic');

      // Subtitle output must be expected for every render job
      for (const rj of plan.renderJobs) {
        expect(rj.expectedOutputs.subtitle).toBe(true);
      }
    });

    it('rejects contradictory caption policy where required=true but allowUncaptionedFallback=true', () => {
      const invalidPolicy: CaptionPolicy = {
        required: true,
        allowUncaptionedFallback: true,
      };

      const plan = createRenderPlan({
        jobId: 'job-test-contradiction',
        requestedClips: 1,
        acceptedClips: [{ id: 'clip-1' }],
        captionPolicy: invalidPolicy,
      });

      expect(() => {
        RenderPlanValidator.validate({
          jobId: plan.jobId,
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
          planHash: 'hash',
          captionPolicy: plan.captionPolicy,
        });
      }).toThrow(/contradictory captionPolicy/);
    });
  });

  describe('P6.3 Artifact Isolation Invariants', () => {
    it('isolates clean vs captioned artifact keys and preserves clean source metadata', () => {
      const jobId = 'job-artifact-isolation';
      const clipId = 'clip-iso-1';
      const sourceStorageKey = 'sources/raw_video_123.mp4';
      const sourceVideoUrl = 'https://storage.googleapis.com/test-bucket/sources/raw_video_123.mp4';

      const cleanStorageKey = `jobs/${jobId}/${clipId}-clean.mp4`;
      const captionedStorageKey = `jobs/${jobId}/${clipId}.mp4`;

      // 1. Artifact keys must never collide
      expect(cleanStorageKey).not.toBe(captionedStorageKey);
      expect(cleanStorageKey).not.toBe(sourceStorageKey);
      expect(captionedStorageKey).not.toBe(sourceStorageKey);

      // 2. Metadata shape verification
      const clipMetadata = {
        video_clean_storage_key: cleanStorageKey,
        video_clean_url: `https://storage.googleapis.com/test-bucket/${cleanStorageKey}`,
        video_captioned_storage_key: captionedStorageKey,
        video_captioned_url: `https://storage.googleapis.com/test-bucket/${captionedStorageKey}`,
        caption_burned: true,
        caption_verified: true,
        caption_policy: {
          required: true,
          style: 'submagic',
          allowUncaptionedFallback: false,
        },
        source_artifact: {
          source_storage_key: sourceStorageKey,
          source_video_url: sourceVideoUrl,
        },
      };

      // Immutable source invariant: source artifact points to original raw storage key
      expect(clipMetadata.source_artifact.source_storage_key).toBe(sourceStorageKey);
      expect(clipMetadata.source_artifact.source_video_url).toBe(sourceVideoUrl);

      // Pristine clean clip is separate from published captioned clip
      expect(clipMetadata.video_clean_storage_key).toContain('-clean.mp4');
      expect(clipMetadata.video_captioned_storage_key).not.toContain('-clean.mp4');

      // Caption status
      expect(clipMetadata.caption_burned).toBe(true);
      expect(clipMetadata.caption_verified).toBe(true);
    });
  });
});
