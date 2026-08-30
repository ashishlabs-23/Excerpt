import React from 'react';
import { VideoJob } from '@excerpt/clipping-core';
import { getJobStatusMeta } from '../../lib/jobStatus';

export interface DashboardMetricsProps {
  jobs: VideoJob[];
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({ jobs }) => {
  const metrics = {
    inProgress: 0,
    success: 0,
    partialSuccess: 0,
    failure: 0,
    needsAttention: 0
  };

  jobs.forEach((job) => {
    const meta = getJobStatusMeta(job.status);
    switch (meta.category) {
      case 'in_progress':
        metrics.inProgress++;
        break;
      case 'success':
        metrics.success++;
        break;
      case 'partial_success':
        metrics.partialSuccess++;
        break;
      case 'failure':
        metrics.failure++;
        break;
      case 'needs_attention':
        metrics.needsAttention++;
        break;
    }
  });

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 my-6">
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <p className="text-xs font-semibold text-slate-400">Processing</p>
        <p className="text-2xl font-bold text-indigo-400 mt-1">{metrics.inProgress}</p>
      </div>
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <p className="text-xs font-semibold text-slate-400">Completed (Full)</p>
        <p className="text-2xl font-bold text-emerald-400 mt-1">{metrics.success}</p>
      </div>
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <p className="text-xs font-semibold text-slate-400">Partial Delivery</p>
        <p className="text-2xl font-bold text-amber-400 mt-1">{metrics.partialSuccess}</p>
      </div>
      <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
        <p className="text-xs font-semibold text-slate-400">Failed Jobs</p>
        <p className="text-2xl font-bold text-red-400 mt-1">{metrics.failure}</p>
      </div>
      <div className="p-4 rounded-xl bg-slate-900 border border-purple-500/30 bg-purple-950/20">
        <p className="text-xs font-semibold text-purple-300">Needs Attention</p>
        <p className="text-2xl font-bold text-purple-300 mt-1">{metrics.needsAttention}</p>
      </div>
    </div>
  );
};
