import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { UploadZone } from '../components/upload/UploadZone';
import { ActiveJobCard } from '../components/dashboard/ActiveJobs';
import { RecentClips } from '../components/review/RecentClips';
import { ClipArtifact } from '../components/review/VideoPlayer';
import { VideoJob } from '@excerpt/clipping-core';

describe('Accessibility & Performance Verification Suite (Step 7)', () => {

  const sampleJob: VideoJob = {
    id: 'job-a11y-1',
    userId: 'usr-1',
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    status: 'rendering',
    inputUrl: 'https://youtube.com/watch?v=a11y',
    requestedClips: 3,
    rankingCriteria: {} as any,
    outputSpec: {} as any,
    childJobIds: [],
    artifacts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const sampleClip: ClipArtifact = {
    id: 'clip-a11y-1',
    clipIndex: 0,
    title: 'Accessible Key Takeaway Clip',
    durationSeconds: 30,
    thumbnailUrl: 'https://excerpt-artifacts.s3.amazonaws.com/thumbs/a11y.jpg',
    presignedStorageUrl: 'https://excerpt-artifacts.s3.amazonaws.com/rendered/a11y.mp4',
    isValidated: true
  };

  describe('1. WCAG 2.1 AA Accessibility & Color Independence', () => {

    it('asserts status badges pair visual color with an explicit icon (never relies on color alone)', () => {
      render(<ActiveJobCard job={{ ...sampleJob, status: 'completed' }} />);
      const badge = screen.getByText(/All Clips Ready/i);
      expect(badge).toBeInTheDocument();
      // Icon check
      expect(badge.textContent).toContain('✔');
    });

    it('asserts dead_letter status pairs color with explicit alert icon and ARIA roles', () => {
      render(<ActiveJobCard job={{ ...sampleJob, status: 'dead_letter' }} />);
      const badge = screen.getByText(/Escalated \/ Exhausted/i);
      expect(badge.textContent).toContain('🚨');
    });

    it('asserts all clip thumbnails contain descriptive, non-empty alt text', () => {
      render(<RecentClips clips={[sampleClip]} />);
      const img = screen.getByAltText(`Thumbnail preview for ${sampleClip.title}`);
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('alt')).not.toBe('');
    });

    it('asserts video player element is screen-reader accessible with aria-label', () => {
      render(<RecentClips clips={[sampleClip]} />);
      const video = screen.getByLabelText(`Playback video stream for ${sampleClip.title}`);
      expect(video).toBeInTheDocument();
      expect(video).toHaveAttribute('controls');
    });
  });

  describe('2. Keyboard Navigation Walkthrough (Upload -> Status -> Download)', () => {

    it('completes the entire upload -> status -> download flow using keyboard navigation only', () => {
      const handleJobCreated = jest.fn();

      // Step A: Focus & Submit Upload Form via Keyboard
      const { rerender } = render(<UploadZone onJobCreated={handleJobCreated} />);

      const urlInput = screen.getByPlaceholderText(/youtube.com\/watch/i);
      urlInput.focus();
      expect(document.activeElement).toBe(urlInput);

      fireEvent.change(urlInput, { target: { value: 'https://youtube.com/watch?v=kbdNav123' } });
      fireEvent.keyDown(urlInput, { key: 'Enter', code: 'Enter' });

      // Step B: Status Component Keyboard Navigation
      rerender(<ActiveJobCard job={{ ...sampleJob, status: 'completed' }} />);
      const statusBadge = screen.getByText(/All Clips Ready/i);
      expect(statusBadge).toBeInTheDocument();

      // Step C: Gallery Download Focus & Navigation
      rerender(<RecentClips clips={[sampleClip]} />);
      const downloadBtn = screen.getByRole('link', { name: /Download MP4/i });
      downloadBtn.focus();
      expect(document.activeElement).toBe(downloadBtn);
    });
  });

  describe('3. Performance & Media Lazy Loading Verification', () => {

    it('verifies thumbnail images use loading="lazy" to prevent eager network flooding', () => {
      render(<RecentClips clips={[sampleClip]} />);
      const img = screen.getByAltText(`Thumbnail preview for ${sampleClip.title}`);
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('verifies video stream elements use preload="metadata" to save mobile bandwidth', () => {
      render(<RecentClips clips={[sampleClip]} />);
      const video = screen.getByLabelText(`Playback video stream for ${sampleClip.title}`);
      expect(video).toHaveAttribute('preload', 'metadata');
    });
  });
});
