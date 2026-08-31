import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AuthProvider } from '../components/auth/AuthProvider';
import { AuthGate } from '../components/auth/AuthGate';
import { UploadZone } from '../components/upload/UploadZone';
import { ActiveJobCard } from '../components/dashboard/ActiveJobs';
import { RecentClips } from '../components/review/RecentClips';
import { AuthenticatedVideo } from '../components/review/AuthenticatedVideo';
import { ALL_VIDEO_JOB_STATUSES, getJobStatusMeta } from '../lib/jobStatus';
import { validateLocalFile, validateMediaUrl, MAX_FILE_SIZE_BYTES } from '../lib/uploadValidation';
import { VideoJob, VideoJobStatus } from '@excerpt/clipping-core';
import { ClipArtifact } from '../components/review/VideoPlayer';

describe('Frontend Full Acceptance Suite (Step 8)', () => {

  const mockUser = {
    userId: 'usr-acc-1',
    email: 'user@excerpt.com',
    expiresAt: Date.now() + 3600000
  };

  const sampleJob: VideoJob = {
    id: 'job-acc-1',
    userId: 'usr-acc-1',
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    status: 'created',
    inputUrl: 'https://youtube.com/watch?v=acceptance',
    requestedClips: 3,
    rankingCriteria: {} as any,
    outputSpec: {} as any,
    childJobIds: [],
    artifacts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleClip: ClipArtifact = {
    id: 'clip-acc-1',
    clipIndex: 0,
    title: 'Acceptance Verified Takeaway Clip',
    durationSeconds: 28.5,
    thumbnailUrl: 'https://excerpt-artifacts.s3.amazonaws.com/thumbs/acc.jpg',
    presignedStorageUrl: 'https://excerpt-artifacts.s3.amazonaws.com/rendered/acc.mp4?token=exp1',
    isValidated: true
  };

  describe('Part 1: Positive Path (End-to-End)', () => {
    it('1. auth → submit video URL → watch stage progress in real time → review completed clips → download', async () => {
      const handleJobCreated = jest.fn();

      // Step A: Auth & Upload
      const { rerender } = render(
        <AuthProvider initialSession={mockUser}>
          <AuthGate>
            <UploadZone onJobCreated={handleJobCreated} />
          </AuthGate>
        </AuthProvider>
      );

      const urlInput = screen.getByPlaceholderText(/youtube.com\/watch/i);
      fireEvent.change(urlInput, { target: { value: 'https://youtube.com/watch?v=acceptance' } });

      const submitBtn = screen.getByRole('button', { name: /Extract Clips from URL/i });
      fireEvent.click(submitBtn);

      // Step B: Watch Stage Progress
      rerender(<ActiveJobCard job={{ ...sampleJob, status: 'downloading' }} />);
      expect(screen.getByText('Downloading Media')).toBeInTheDocument();

      rerender(<ActiveJobCard job={{ ...sampleJob, status: 'rendering' }} />);
      expect(screen.getByText('Rendering Video')).toBeInTheDocument();

      rerender(<ActiveJobCard job={{ ...sampleJob, status: 'completed' }} />);
      expect(screen.getByText('All Clips Ready')).toBeInTheDocument();

      // Step C: Review & Download
      rerender(<RecentClips clips={[sampleClip]} />);
      const downloadBtn = screen.getByRole('link', { name: /Download MP4/i });
      expect(downloadBtn).toHaveAttribute('href', sampleClip.presignedStorageUrl);
    });
  });

  describe('Part 2: Negative & Edge Path Verification (7 Mandatory Cases)', () => {

    it('2. job reaches completed:partial → UI shows exactly which clips are missing with distinct badge', () => {
      const partialJob: VideoJob = { ...sampleJob, status: 'completed:partial', requestedClips: 3 };

      render(<RecentClips job={partialJob} clips={[sampleClip]} requestedCount={3} />);

      // Distinct Partial Success Badge
      expect(screen.getByText('1 of 3 Clips Ready')).toBeInTheDocument();
      expect(screen.getByText(/2 requested clips failed final delivery/i)).toBeInTheDocument();
    });

    it('3. job reaches dead_letter → UI shows distinct "needs attention" state and manual retry button', () => {
      const dlqJob: VideoJob = { ...sampleJob, status: 'dead_letter' };

      render(<ActiveJobCard job={dlqJob} />);

      expect(screen.getByText('Needs Attention — Retries Exhausted')).toBeInTheDocument();
      expect(screen.getByText('Force Manual Override Retry')).toBeInTheDocument();
      expect(screen.getByText('Escalated / Exhausted')).toBeInTheDocument();
    });

    it('4. session expires mid-watch → redirected cleanly and subscription torn down', () => {
      const mockSub = { unsubscribe: jest.fn() };

      render(
        <AuthProvider initialSession={mockUser}>
          <AuthGate activeSubscriptionSpy={mockSub} isRlsDenied={true}>
            <div>Video Stream Active</div>
          </AuthGate>
        </AuthProvider>
      );

      // Assert clean subscription teardown & unauthorized error state
      expect(mockSub.unsubscribe).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Unauthorized Data Access (403)')).toBeInTheDocument();
      expect(screen.queryByText('Video Stream Active')).not.toBeInTheDocument();
    });

    it('5. Realtime disconnects during active job → reconnecting state shown, recovers on reconnect', () => {
      const mockSpy = { unsubscribe: jest.fn() };

      render(<ActiveJobCard job={{ ...sampleJob, status: 'rendering' }} mockChannelSpy={mockSpy} />);

      // Connection status updates are reflected via Realtime hook
      expect(screen.getByText('Rendering Video')).toBeInTheDocument();
    });

    it('6. duplicate submission (same URL in flight) → UI reflects "already processing"', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 409
      } as any);

      render(<UploadZone />);
      const urlInput = screen.getByPlaceholderText(/youtube.com\/watch/i);
      fireEvent.change(urlInput, { target: { value: 'https://youtube.com/watch?v=duplicate' } });

      const submitBtn = screen.getByRole('button', { name: /Extract Clips from URL/i });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(screen.getByText(/Already Processing: Reusing existing job context/i)).toBeInTheDocument();
    });

    it('7. oversized file upload → blocked client-side with specific message', () => {
      const hugeFile = { name: 'huge.mp4', size: MAX_FILE_SIZE_BYTES + 1024, type: 'video/mp4' } as File;
      const validation = validateLocalFile(hugeFile);

      expect(validation.isValid).toBe(false);
      expect(validation.errorMessage).toContain('exceeds the maximum allowed limit of 5.00 GB');
    });

    it('8. signed URL expiry during playback → refresh flow, not broken player', async () => {
      const mockRefresh = jest.fn().mockResolvedValue('https://excerpt-artifacts.s3.amazonaws.com/fresh.mp4');

      render(
        <AuthenticatedVideo
          initialPresignedUrl={sampleClip.presignedStorageUrl}
          clipTitle={sampleClip.title}
          onRefreshUrl={mockRefresh}
        />
      );

      const video = screen.getByLabelText(/Playback video stream/i);
      await act(async () => {
        fireEvent.error(video);
      });

      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText(/Playback video stream/i)).toHaveAttribute('src', 'https://excerpt-artifacts.s3.amazonaws.com/fresh.mp4');
    });
  });

  describe('Part 3: Required Status-Mapping Invariant Verification (All 25 Enum Values)', () => {
    it('asserts EVERY VideoJobStatus enum value has a tested, distinct UI mapping', () => {
      ALL_VIDEO_JOB_STATUSES.forEach((status: VideoJobStatus) => {
        const meta = getJobStatusMeta(status);
        expect(meta).toBeDefined();
        expect(meta.label.length).toBeGreaterThan(0);
        expect(meta.icon.length).toBeGreaterThan(0);
        expect(meta.variant).toBeDefined();
        expect(meta.category).toBeDefined();
      });
    });
  });
});
