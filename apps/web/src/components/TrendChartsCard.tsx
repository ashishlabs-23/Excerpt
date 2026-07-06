import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart2 } from 'lucide-react';
import { authFetch } from '@/lib/api';

export function TrendChartsCard() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await authFetch('/api/system/metrics/history');
        if (!res.ok) throw new Error('Failed to fetch metrics history');
        const json = await res.json();
        if (mounted) {
          setMetrics(json.data || []);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) setLoading(false);
      }
    };
    
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 300000); // 5 min
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading || metrics.length === 0) {
    return null; // hide if no data
  }

  // Find max values for scaling
  const maxJobs = Math.max(...metrics.map(m => m.jobs_processed), 1);
  const maxRestarts = Math.max(...metrics.map(m => m.worker_restarts), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-6 border-white/5 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-primary/80 border border-white/10">
            <BarChart2 size={18} />
          </div>
          <div>
            <h3 className="text-white font-black uppercase italic tracking-tight text-sm mb-0.5">
              Platform Trends
            </h3>
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.2em]">
              7-Day Production History
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
        
        {/* Jobs Processed Chart */}
        <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Jobs Processed</p>
          <div className="flex items-end gap-2 h-24">
            {metrics.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 group">
                <div 
                  className="w-full bg-emerald-500/80 rounded-t-sm transition-all group-hover:bg-emerald-400"
                  style={{ height: `${Math.max((m.jobs_processed / maxJobs) * 100, 5)}%` }}
                />
                <span className="text-[8px] text-white/30 uppercase font-mono">{new Date(m.date).getDate()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Worker Restarts Chart */}
        <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-4">Worker Restarts</p>
          <div className="flex items-end gap-2 h-24">
            {metrics.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-2 group">
                <div 
                  className="w-full bg-rose-500/80 rounded-t-sm transition-all group-hover:bg-rose-400"
                  style={{ height: `${Math.max((m.worker_restarts / maxRestarts) * 100, 5)}%` }}
                />
                <span className="text-[8px] text-white/30 uppercase font-mono">{new Date(m.date).getDate()}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
