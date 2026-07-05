"use client";

import React from "react";
import { motion } from "framer-motion";
import { GitCommit, Clock, Cpu, Database, HardDrive, Tag, Globe, Package } from "lucide-react";
import { DashboardData } from "@/lib/useDashboard";

interface Props {
  deployment: DashboardData["deployment"];
}

export const DeploymentInfoCard: React.FC<Props> = ({ deployment }) => {
  const rows = [
    {
      icon: GitCommit,
      label: "Commit",
      value: deployment.commit
        ? deployment.commit.slice(0, 7).toUpperCase()
        : "—",
      color: "text-primary",
    },
    {
      icon: Clock,
      label: "Build Time",
      value: deployment.buildTime
        ? new Date(deployment.buildTime).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "—",
      color: "text-white/60",
    },
    {
      icon: Package,
      label: "Worker",
      value: deployment.versions?.workerVersion ?? "—",
      color: "text-amber-400",
    },
    {
      icon: HardDrive,
      label: "Download Engine",
      value: deployment.versions?.downloadEngineVersion ?? "—",
      color: "text-emerald-400",
    },
    {
      icon: Tag,
      label: "Schema",
      value: deployment.schemaVersion ?? "—",
      color: "text-blue-400",
    },
    {
      icon: Globe,
      label: "Branch",
      value: deployment.branch ?? "master",
      color: "text-indigo-400",
    },
    {
      icon: Cpu,
      label: "Node",
      value: deployment.versions?.node ?? "—",
      color: "text-white/40",
    },
    {
      icon: Database,
      label: "DB",
      value: deployment.health?.database === "connected" ? "Connected" : (deployment.health?.database ?? "—"),
      color:
        deployment.health?.database === "connected"
          ? "text-emerald-400"
          : "text-rose-400",
    },
  ];

  const env = deployment.environment ?? "unknown";
  const isProd = env === "production";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="p-6 rounded-[28px] glass-card border-white/5 hover:border-primary/20 transition-all duration-500 overflow-hidden relative"
    >
      {/* Top glow */}
      <div className="absolute -top-8 -left-8 w-40 h-40 rounded-full bg-primary/10 blur-[60px] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Deployment
            </p>
            <h2 className="text-base font-black text-white uppercase tracking-tight">
              Production Info
            </h2>
          </div>
          <span
            className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
              isProd
                ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                : "border-amber-500/30 text-amber-400 bg-amber-500/10"
            }`}
          >
            {env}
          </span>
        </div>

        {/* Grid of info rows */}
        <div className="grid grid-cols-2 gap-3">
          {rows.map((row, i) => {
            const Icon = row.icon;
            return (
              <motion.div
                key={row.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/[0.04] hover:border-white/10 transition-all"
              >
                <div
                  className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${row.color}`}
                >
                  <Icon size={13} />
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/30 leading-none mb-0.5">
                    {row.label}
                  </p>
                  <p className="text-xs font-bold text-white truncate">{row.value}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Uptime since */}
        {deployment.startedAt && (
          <p className="text-[9px] text-white/20 mt-4 text-center tracking-widest uppercase">
            Running since{" "}
            {new Date(deployment.startedAt).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>
    </motion.div>
  );
};
