import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GitCommit, Clock, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { authFetch } from '@/lib/api';

export function DeploymentMetadataCard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchMeta = async () => {
      try {
        const res = await authFetch('/api/system/live');
        if (!res.ok) throw new Error('Failed to fetch deployment meta');
        const json = await res.json();
        if (mounted) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) setLoading(false);
      }
    };
    
    fetchMeta();
    const interval = setInterval(fetchMeta, 60000); // refresh every minute
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading || !data?.versions) return null;

  const { versions, uptime, status } = data;
  const isHealthy = status === 'active';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card rounded-3xl p-6 border-white/5 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent pointer-events-none" />
      
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 border border-white/10">
            <Server size={18} />
          </div>
          <div>
            <h3 className="text-white font-black uppercase italic tracking-tight text-sm mb-0.5">
              Production Release
            </h3>
            <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.2em]">
              Environment Metadata
            </p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${
          isHealthy ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {isHealthy ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
          {status}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <GitCommit size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Commit</span>
          </div>
          <p className="text-white font-mono text-xs truncate">
            {versions.commit !== 'local' ? versions.commit.substring(0, 7) : 'LOCAL'}
          </p>
        </div>

        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <Clock size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Uptime</span>
          </div>
          <p className="text-white font-mono text-xs">
            {Math.floor(uptime / 3600)}h {Math.floor((uptime % 3600) / 60)}m
          </p>
        </div>

        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <Server size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">API Version</span>
          </div>
          <p className="text-white font-mono text-xs">
            v{versions.apiVersion}
          </p>
        </div>

        <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
          <div className="flex items-center gap-2 text-white/40 mb-2">
            <Server size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">Worker Node</span>
          </div>
          <p className="text-white font-mono text-xs">
            v{versions.workerVersion}
          </p>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
        <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">
          Build Time: {new Date(versions.buildTimestamp).toLocaleString()}
        </span>
        <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">
          DL Engine: {versions.downloadEngineVersion}
        </span>
      </div>
    </motion.div>
  );
}
