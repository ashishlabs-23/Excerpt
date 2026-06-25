"use client";

import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Shield, Zap, RefreshCw, Layers, CheckCircle2, AlertTriangle, Play, Award } from "lucide-react";
import { authFetch } from "@/lib/api";

interface QualityMetrics {
  draftRuntime: number;
  qualityRuntime: number;
  generateMoreRuntime: number;
  cacheHitRate: number;
  duplicateRate: number;
  renderFailures: number;
  userAcceptanceRate: number;
  arenaWinRate: number;
}

export const QualityDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<QualityMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    try {
      const response = await authFetch("/api/system/quality-metrics");
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
        setError(null);
      } else {
        setError("Failed to fetch quality telemetry.");
      }
    } catch (err: any) {
      setError(err.message || "Network error.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="p-8 rounded-[32px] glass-card border-white/5 animate-pulse bg-white/[0.01] mb-12">
        <div className="h-6 w-48 bg-white/10 rounded mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-white/5 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="p-8 rounded-[32px] glass-card border-red-500/20 bg-red-500/[0.02] mb-12 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <AlertTriangle className="text-red-400" size={24} />
          <div>
            <h3 className="text-white font-bold">Observability Link Offline</h3>
            <p className="text-white/40 text-xs mt-1">Unable to stream production quality metrics.</p>
          </div>
        </div>
        <button onClick={fetchMetrics} className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs uppercase tracking-wider transition-all">
          Retry Sync
        </button>
      </div>
    );
  }

  const items = [
    {
      label: "Draft Runtime",
      value: `${metrics.draftRuntime}s`,
      target: "< 120s",
      status: metrics.draftRuntime < 120 ? "passing" : "failing",
      icon: Zap,
      color: "text-amber-400",
    },
    {
      label: "Quality Runtime",
      value: `${(metrics.qualityRuntime / 60).toFixed(1)}m`,
      target: "< 5m",
      status: metrics.qualityRuntime < 300 ? "passing" : "failing",
      icon: RefreshCw,
      color: "text-primary",
    },
    {
      label: "Explorer (More)",
      value: `${metrics.generateMoreRuntime}s`,
      target: "< 90s",
      status: metrics.generateMoreRuntime < 90 ? "passing" : "failing",
      icon: Play,
      color: "text-emerald-400",
    },
    {
      label: "Cache Hit Rate",
      value: `${metrics.cacheHitRate}%`,
      target: "> 90%",
      status: metrics.cacheHitRate >= 90 ? "passing" : "failing",
      icon: Layers,
      color: "text-blue-400",
    },
    {
      label: "Duplicate Rate",
      value: `${metrics.duplicateRate}%`,
      target: "< 1%",
      status: metrics.duplicateRate < 1 ? "passing" : "failing",
      icon: Shield,
      color: "text-indigo-400",
    },
    {
      label: "Render Failures",
      value: `${metrics.renderFailures}%`,
      target: "< 2%",
      status: metrics.renderFailures < 2 ? "passing" : "failing",
      icon: AlertTriangle,
      color: "text-rose-400",
    },
    {
      label: "Acceptance Rate",
      value: `${metrics.userAcceptanceRate}%`,
      target: "> 70%",
      status: metrics.userAcceptanceRate >= 70 ? "passing" : "failing",
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Arena Win Rate",
      value: `${metrics.arenaWinRate}%`,
      target: "> 65%",
      status: metrics.arenaWinRate >= 65 ? "passing" : "failing",
      icon: Award,
      color: "text-amber-400",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 sm:p-8 rounded-[28px] sm:rounded-[32px] glass-card border-white/5 bg-white/[0.01] mb-12 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.05),transparent_40%)]" />
      <div className="relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Platform Observability</p>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase italic">Quality Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Connected to Telemetry Stream</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {items.map((item, idx) => {
            const Icon = item.icon;
            const isPassing = item.status === "passing";
            return (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="p-5 rounded-2xl border border-white/5 bg-black/30 hover:border-white/10 transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center ${item.color}`}>
                    <Icon size={16} />
                  </div>
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                    isPassing ? "text-emerald-400 bg-emerald-500/10" : "text-rose-400 bg-rose-500/10"
                  }`}>
                    {isPassing ? "PASS" : "FAIL"}
                  </span>
                </div>

                <div>
                  <h3 className="text-white/40 text-[9px] font-bold uppercase tracking-wider mb-1">{item.label}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white tracking-tight">{item.value}</span>
                    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Target: {item.target}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
