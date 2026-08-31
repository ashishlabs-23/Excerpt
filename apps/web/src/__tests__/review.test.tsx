import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { AuthenticatedVideo } from '../components/review/AuthenticatedVideo';
import { RecentClips } from '../components/review/RecentClips';
import { ClipArtifact } from '../components/review/VideoPlayer';
import { VideoJob } from '@excerpt/clipping-core';

describe('Clip Review and Download Hardening Tests (Step 5)', () => {

  const sampleClip: ClipArtifact = {
    id: 'clip-101',
    clipIndex: 0,
    title: 'Podcast Key Takeaway Clip',
    durationSeconds: 45.2,
    thumbnailUrl: 'https://excerpt-artifacts.s3.amazonaws.com/thumbs/clip-101.jpg',
    presignedStorageUrl: 'https://excerpt-artifacts.s3.amazonaws.com/rendered/clip-101.mp4?token=exp123',
    isValidated: true
  };

  it('1. signed URL expiry mid-playback triggers refresh flow, not silent broken player', async () => {
    const mockRefresh = jest.fn().mockResolvedValue(
      'https://excerpt-artifacts.s3.amazonaws.com/rendered/clip-101.mp4?token=fresh999'
    );

    render(
      <AuthenticatedVideo
        initialPresignedUrl={sampleClip.presignedStorageUrl}
        clipTitle={sampleClip.title}
        onRefreshUrl={mockRefresh}
      />
    );

    const videoEl = screen.getByLabelText(/Playback video stream/i);
    expect(videoEl).toHaveAttribute('src', sampleClip.presignedStorageUrl);

    // Simulate video element onError event (triggering when token expires mid-stream)
    await act(async () => {
      fireEvent.error(videoEl);
    });

    // Assert refresh handler was invoked
    expect(mockRefresh).toHaveBeenCalledTimes(1);

    // Assert video element updated to fresh URL
    const updatedVideoEl = screen.getByLabelText(/Playback video stream/i);
    expect(updatedVideoEl).toHaveAttribute('src', 'https://excerpt-artifacts.s3.amazonaws.com/rendered/clip-101.mp4?token=fresh999');
  });

  it('2. completed:partial gallery view explicitly shows missing-clip count', () => {
    const partialJob: VideoJob = {
      id: 'job-partial-1',
      userId: 'usr-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      status: 'completed:partial',
      requestedClips: 3, // 3 requested, 1 clip ready -> 2 missing
      rankingCriteria: {} as any,
      outputSpec: {} as any,
      childJobIds: [],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    render(
      <RecentClips
        job={partialJob}
        clips={[sampleClip]}
        requestedCount={3}
      />
    );

    // Assert partial delivery banner renders missing clip count explicitly
    expect(screen.getByText('1 of 3 Clips Ready')).toBeInTheDocument();
    expect(screen.getByText(/2 requested clips failed final delivery/i)).toBeInTheDocument();
  });

  it('3. download link resolves to live storage S3/B2 URL, not local public/ path', () => {
    render(<RecentClips clips={[sampleClip]} />);

    const downloadLink = screen.getByRole('link', { name: /Download MP4/i });
    expect(downloadLink).toHaveAttribute('href', sampleClip.presignedStorageUrl);
    expect(downloadLink.getAttribute('href')).not.toContain('public/clips');
    expect(downloadLink.getAttribute('href')).toContain('https://excerpt-artifacts.s3.amazonaws.com');
  });

  it('4. empty gallery renders EmptyState component with call to action', () => {
    const mockCreateJob = jest.fn();

    render(<RecentClips clips={[]} onCreateJob={mockCreateJob} />);

    expect(screen.getByText('No Clips Available')).toBeInTheDocument();
    const actionButton = screen.getByRole('button', { name: /Create Your First Clip/i });
    expect(actionButton).toBeInTheDocument();

    act(() => {
      actionButton.click();
    });
    expect(mockCreateJob).toHaveBeenCalled();
  });

  it('5. thumbnails lazy-load and have non-empty alt text', () => {
    render(<RecentClips clips={[sampleClip]} />);

    const thumbnailImg = screen.getByAltText(`Thumbnail preview for ${sampleClip.title}`);
    expect(thumbnailImg).toBeInTheDocument();
    expect(thumbnailImg).toHaveAttribute('loading', 'lazy');
    expect(thumbnailImg.getAttribute('alt')).not.toBe('');
  });
});
