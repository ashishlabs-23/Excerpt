import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { ActiveJobs, ActiveJobCard } from '../components/dashboard/ActiveJobs';
import { DashboardMetrics } from '../components/dashboard/DashboardMetrics';
import { VideoJob } from '@excerpt/clipping-core';

describe('Job Status Tracking & Realtime Updates (Step 4)', () => {

  const baseJob: VideoJob = {
    id: 'job-stage-test',
    userId: 'usr-1',
    tenantId: 'tenant-1',
    correlationId: 'corr-1',
    status: 'created',
    inputUrl: 'https://youtube.com/watch?v=stage1',
    requestedClips: 3,
    rankingCriteria: { profile: 'standard', weights: { hook: 0.3 } } as any,
    outputSpec: { aspectRatio: '9:16' } as any,
    childJobIds: [],
    artifacts: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  it('1. job transitioning through multiple stages updates state cleanly in real time', () => {
    const { rerender } = render(<ActiveJobCard job={baseJob} />);

    // Stage 1: Created / Queued
    expect(screen.getByText('Job Queued')).toBeInTheDocument();

    // Stage 2: Downloading
    const downloadingJob = { ...baseJob, status: 'downloading' as const };
    rerender(<ActiveJobCard job={downloadingJob} />);
    expect(screen.getByText('Downloading Media')).toBeInTheDocument();

    // Stage 3: Rendering
    const renderingJob = { ...baseJob, status: 'rendering' as const };
    rerender(<ActiveJobCard job={renderingJob} />);
    expect(screen.getByText('Rendering Video')).toBeInTheDocument();

    // Stage 4: Completed
    const completedJob = { ...baseJob, status: 'completed' as const };
    rerender(<ActiveJobCard job={completedJob} />);
    expect(screen.getByText('All Clips Ready')).toBeInTheDocument();
  });

  it('2. failed:download and failed:render render distinguishable failure details', () => {
    const downloadFailedJob: VideoJob = { ...baseJob, id: 'job-dl-fail', status: 'failed:download' };
    const renderFailedJob: VideoJob = { ...baseJob, id: 'job-rnd-fail', status: 'failed:render' };

    const { rerender } = render(<ActiveJobCard job={downloadFailedJob} />);

    // Download Failure Card
    expect(screen.getByText('Failure Category: Download Failed')).toBeInTheDocument();
    expect(screen.getByText(/Unable to fetch source media/i)).toBeInTheDocument();

    // Render Failure Card
    rerender(<ActiveJobCard job={renderFailedJob} />);
    expect(screen.getByText('Failure Category: Render Engine Error')).toBeInTheDocument();
    expect(screen.getByText(/FFmpeg render jobs failed/i)).toBeInTheDocument();
  });

  it('3. dead_letter renders distinctly from ordinary failed states', () => {
    const deadLetterJob: VideoJob = { ...baseJob, id: 'job-dlq', status: 'dead_letter' };
    const ordinaryFailedJob: VideoJob = { ...baseJob, id: 'job-fail', status: 'failed:download' };

    const { rerender } = render(<ActiveJobCard job={deadLetterJob} />);

    // Dead Letter Alert Card
    expect(screen.getByText('Needs Attention — Retries Exhausted')).toBeInTheDocument();
    expect(screen.getByText('Force Manual Override Retry')).toBeInTheDocument();
    expect(screen.getByText('Escalated / Exhausted')).toBeInTheDocument();

    // Ordinary Failure Card
    rerender(<ActiveJobCard job={ordinaryFailedJob} />);
    expect(screen.queryByText('Needs Attention — Retries Exhausted')).not.toBeInTheDocument();
    expect(screen.getByText('Download Failed')).toBeInTheDocument();
  });

  it('4. DashboardMetrics correctly categorizes jobs strictly using getJobStatusMeta', () => {
    const jobs: VideoJob[] = [
      { ...baseJob, id: '1', status: 'completed' },
      { ...baseJob, id: '2', status: 'completed:partial' },
      { ...baseJob, id: '3', status: 'failed:download' },
      { ...baseJob, id: '4', status: 'dead_letter' },
      { ...baseJob, id: '5', status: 'rendering' }
    ];

    render(<DashboardMetrics jobs={jobs} />);

    expect(screen.getByText('Completed (Full)')).toBeInTheDocument();
    expect(screen.getByText('Partial Delivery')).toBeInTheDocument();
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
  });
});
