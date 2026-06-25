"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Scissors, Activity, ShieldCheck, Zap } from 'lucide-react';
import { authFetch } from '@/lib/api';

export const DashboardMetrics: React.FC = () => {
  const [stats, setStats] = React.useState({
    totalJobs: 0,
    totalClips: 0,
    successRate: 0,
  });
  const [isConnected, setIsConnected] = React.useState(true);

  React.useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await authFetch('/api/video/stats');
        if (response.ok) {
          const data = await response.json();
          setStats(data);
          setIsConnected(true);
        } else {
          setIsConnected(false);
        }
      } catch (error) {
        console.error('[Metrics]: Failed to fetch stats:', error);
        setIsConnected(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const metrics = [
    {
      label: "Processing Jobs",
      value: stats.totalJobs.toLocaleString(),
      meta: isConnected ? "Queued and completed tasks" : "Sync unavailable",
      icon: Activity,
      color: "text-primary",
    },
    {
      label: "Total Clips",
      value: stats.totalClips.toLocaleString(),
      meta: isConnected ? "Clips stored in your dashboard" : "Metrics paused",
      icon: Scissors,
      color: "text-primary/70",
    },
    {
      label: "Success Rate",
      value: `${stats.successRate}%`,
      meta: isConnected ? "Seamless generation frequency" : "Using last known state",
      icon: ShieldCheck,
      color: "text-emerald-400",
    },
    {
      label: "Estimated Reach",
      value: `${(stats.totalClips * 12.5).toFixed(1)}k`,
      meta: isConnected ? "Projected organic views across social channels" : "Projection paused",
      icon: Zap,
      color: "text-amber-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-16">
      {metrics.map((metric, index) => {
        const Icon = metric.icon;
        return (
          <motion.div 
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.5 }}
            className="group relative p-6 sm:p-8 rounded-[28px] sm:rounded-[32px] glass-card border-white/5 hover:border-primary/20 transition-all duration-500 overflow-hidden"
          >
             {/* Decorative Background Glow */}
            <div className={`absolute -top-10 -right-10 w-32 h-32 blur-[60px] opacity-10 group-hover:opacity-20 transition-opacity rounded-full bg-primary`} />
            
            <div className="relative z-10">
              <div className="flex items-center justify-between gap-4 mb-6 sm:mb-8">
                <div className={`w-12 h-12 rounded-2xl glass-card bg-white/5 flex items-center justify-center ${metric.color}`}>
                  <Icon size={24} />
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-[10px] font-black px-3 py-1 rounded-full tracking-widest uppercase mb-1 ${
                    isConnected
                      ? 'text-emerald-400 bg-emerald-500/10'
                      : 'text-amber-300 bg-amber-500/10'
                  }`}>
                    {isConnected ? 'Live' : 'Retrying'}
                  </span>
                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-[0.2em]">
                    {isConnected ? 'Real-time Sync' : 'Offline State'}
                  </span>
                </div>
              </div>
              
              <div className="space-y-1">
                <h3 className="text-white/30 text-[10px] font-black uppercase tracking-[0.3em]">{metric.label}</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl sm:text-4xl font-bold text-white tracking-tighter">
                    {metric.value}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                </div>
                <p className="text-xs text-white/35 leading-relaxed max-w-[20rem]">
                  {metric.meta}
                </p>
              </div>
            </div>
            
            {/* Hover Progress Bar Decoration */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5 overflow-hidden">
              <motion.div 
                className="h-full bg-primary shadow-[0_0_15px_rgba(200,119,64,0.4)]"
                initial={{ width: 0 }}
                whileInView={{ width: "100%" }}
                transition={{ duration: 1.5, delay: index * 0.2 }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
