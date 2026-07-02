'use client';
import React, { useEffect, useState } from 'react';

export default function DiagnosticsPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [adminSecret, setAdminSecret] = useState('');

  const fetchDiagnostics = async () => {
    try {
      const [jobsRes, workersRes] = await Promise.all([
        fetch('http://localhost:3001/api/diagnostics/jobs', {
          headers: { 'x-admin-secret': adminSecret }
        }),
        fetch('http://localhost:3001/api/diagnostics/workers', {
          headers: { 'x-admin-secret': adminSecret }
        })
      ]);

      if (!jobsRes.ok) throw new Error('Unauthorized or failed to load jobs');
      
      const jobsData = await jobsRes.json();
      const workersData = await workersRes.json();
      
      setJobs(jobsData.jobs || []);
      setWorkers(workersData.workers || []);
      setLoading(false);
    } catch (err) {
      console.error('Failed to load diagnostics', err);
      // Wait for valid secret
    }
  };

  useEffect(() => {
    if (adminSecret || process.env.NODE_ENV === 'development') {
      fetchDiagnostics();
      const interval = setInterval(fetchDiagnostics, 5000);
      return () => clearInterval(interval);
    }
  }, [adminSecret]);

  if (loading && !adminSecret && process.env.NODE_ENV !== 'development') {
    return (
      <div className="p-8 max-w-md mx-auto">
        <h2 className="text-2xl mb-4 font-bold">Admin Login</h2>
        <input 
          type="password" 
          placeholder="Admin Secret" 
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          className="w-full p-2 border rounded text-black mb-4"
        />
        <button onClick={fetchDiagnostics} className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700">Access Diagnostics</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white">
      {/* Sidebar: Jobs & Workers List */}
      <div className="w-1/3 border-r border-gray-800 flex flex-col h-full overflow-hidden">
        <div className="p-4 border-b border-gray-800 bg-[#111]">
          <h1 className="text-xl font-bold mb-2 text-blue-400">Production Dashboard</h1>
          <div className="grid grid-cols-2 gap-2">
            {workers.map((w, i) => (
              <div key={i} className="bg-gray-800 p-2 rounded flex items-center justify-between">
                <span className="text-sm font-medium">{w.name}</span>
                <span className={`w-3 h-3 rounded-full ${w.status === 'Running' ? 'bg-green-500' : 'bg-red-500'}`}></span>
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {jobs.map(job => (
            <div 
              key={job.id} 
              onClick={() => setSelectedJob(job)}
              className={`p-3 mb-2 rounded cursor-pointer border ${selectedJob?.id === job.id ? 'border-blue-500 bg-gray-800' : 'border-gray-800 hover:bg-gray-900'}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-400 truncate max-w-[150px]">{job.id}</span>
                <span className={`text-xs px-2 py-1 rounded font-bold ${job.status === 'failed' ? 'bg-red-900 text-red-200' : job.status === 'completed' ? 'bg-green-900 text-green-200' : 'bg-blue-900 text-blue-200'}`}>
                  {job.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>{job.debug_data?.operation || 'Waiting'}</span>
                <span>{job.progress}%</span>
              </div>
              {job.status === 'failed' && (
                <div className="mt-1 text-xs text-red-400 font-bold">
                  Cause: {job.debug_data?.error_type || 'Unknown'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Detail View */}
      <div className="flex-1 p-6 overflow-y-auto">
        {selectedJob ? (
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold">Job Details</h2>
                <div className="text-gray-400 mt-1">{selectedJob.id}</div>
              </div>
              <div className="space-x-2">
                <button className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded text-sm font-medium transition-colors">Retry</button>
                <button className="bg-red-900 hover:bg-red-800 px-4 py-2 rounded text-sm font-medium transition-colors text-red-200">Cancel</button>
              </div>
            </div>

            {selectedJob.status === 'failed' && (
              <div className="bg-red-900/30 border border-red-500 rounded p-4 mb-6">
                <h3 className="font-bold text-red-400 mb-2">âš ï¸  Failed: {selectedJob.debug_data?.error_type || 'Unknown Error'}</h3>
                <p className="text-sm text-red-200 mb-4">{selectedJob.debug_data?.summary || selectedJob.failed_reason}</p>
                {selectedJob.debug_data?.stderr_tail && (
                  <pre className="bg-black/50 p-3 rounded text-xs text-gray-300 overflow-x-auto border border-red-900/50">
                    {selectedJob.debug_data.stderr_tail}
                  </pre>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded p-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Performance Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Download</span><span>{selectedJob.performance_metrics?.download || 0} ms</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Transcription</span><span>{selectedJob.performance_metrics?.transcription || 0} ms</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Total Run</span><span>{selectedJob.performance_metrics?.total || 0} ms</span></div>
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded p-4">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Download Details</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Target</span><span className="truncate max-w-[200px] text-blue-400"><a href={selectedJob.youtube_url} target="_blank" rel="noreferrer">{selectedJob.youtube_url}</a></span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Extractor</span><span>YouTube</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Resolution</span><span>1080p</span></div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-900 border border-gray-800 rounded p-4">
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">Raw DB Payload</h3>
              <pre className="text-xs text-gray-400 overflow-x-auto">
                {JSON.stringify(selectedJob.payload, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a job from the list to view diagnostics.
          </div>
        )}
      </div>
    </div>
  );
}
