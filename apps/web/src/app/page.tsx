'use client';

import React, { useState } from 'react';
import { AuthGate } from '../components/auth/AuthGate';
import { UploadZone } from '../components/upload/UploadZone';
import { DashboardMetrics } from '../components/dashboard/DashboardMetrics';
import { ActiveJobs } from '../components/dashboard/ActiveJobs';
import { RecentClips } from '../components/review/RecentClips';
import { VideoJob } from '@excerpt/clipping-core';
import { ClipArtifact } from '../components/review/VideoPlayer';

export default function DashboardPage() {
  const [jobs, setJobs] = useState<VideoJob[]>([
    {
      id: 'job-101',
      userId: 'usr-demo',
      tenantId: 'tenant-demo',
      correlationId: 'corr-101',
      status: 'rendering',
      inputUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      requestedClips: 3,
      rankingCriteria: {} as any,
      outputSpec: {} as any,
      childJobIds: ['cj-1', 'cj-2', 'cj-3'],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'job-102',
      userId: 'usr-demo',
      tenantId: 'tenant-demo',
      correlationId: 'corr-102',
      status: 'completed:partial',
      inputUrl: 'https://www.youtube.com/watch?v=podcast_sample',
      requestedClips: 3,
      rankingCriteria: {} as any,
      outputSpec: {} as any,
      childJobIds: ['cj-4', 'cj-5'],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: 'job-103',
      userId: 'usr-demo',
      tenantId: 'tenant-demo',
      correlationId: 'corr-103',
      status: 'dead_letter',
      inputUrl: 'https://www.youtube.com/watch?v=failed_stream',
      requestedClips: 2,
      rankingCriteria: {} as any,
      outputSpec: {} as any,
      childJobIds: [],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  const [clips] = useState<ClipArtifact[]>([
    {
      id: 'clip-1',
      clipIndex: 0,
      title: 'AI Pipeline Architecture Takeaway',
      durationSeconds: 42.5,
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80',
      presignedStorageUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
      isValidated: true
    },
    {
      id: 'clip-2',
      clipIndex: 1,
      title: 'Multi-Agent Debate & Reward Model Peak',
      durationSeconds: 28.0,
      thumbnailUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
      presignedStorageUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
      isValidated: true
    }
  ]);

  const handleJobCreated = (jobId: string, isDuplicate?: boolean) => {
    if (isDuplicate) return;
    const newJob: VideoJob = {
      id: jobId,
      userId: 'usr-demo',
      tenantId: 'tenant-demo',
      correlationId: `corr-${Date.now()}`,
      status: 'downloading',
      inputUrl: 'https://youtube.com/watch?v=new_upload',
      requestedClips: 3,
      rankingCriteria: {} as any,
      outputSpec: {} as any,
      childJobIds: [],
      artifacts: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setJobs((prev) => [newJob, ...prev]);
  };

  const handleRetryJob = (jobId: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: 'downloading' } : j))
    );
  };

  return (
    <AuthGate>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Hero & Upload Section */}
        <section className="text-center space-y-3">
          <h1 className="text-3xl font-extrabold text-slate-100 tracking-tight sm:text-4xl">
            Transform Long Videos into Viral Shorts
          </h1>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Powered by Multi-Agent Debate, Director AI framing, and V5.7 Reward Models.
          </p>
          <div className="pt-4">
            <UploadZone onJobCreated={handleJobCreated} />
          </div>
        </section>

        {/* Dashboard Metrics */}
        <section>
          <h2 className="text-xl font-bold text-slate-200">Pipeline Overview</h2>
          <DashboardMetrics jobs={jobs} />
        </section>

        {/* Active & Recent Jobs */}
        <section>
          <ActiveJobs jobs={jobs} onRetryJob={handleRetryJob} />
        </section>

        {/* Generated Clip Gallery */}
        <section>
          <h2 className="text-xl font-bold text-slate-200">Recent Completed Clips</h2>
          <RecentClips
            job={jobs.find((j) => j.status === 'completed:partial')}
            clips={clips}
            requestedCount={3}
          />
        </section>
      </div>
    </AuthGate>
  );
}
