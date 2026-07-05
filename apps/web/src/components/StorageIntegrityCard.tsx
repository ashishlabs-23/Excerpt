"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Film,
  AlertCircle,
  Clock,
} from "lucide-react";
import { DashboardData } from "@/lib/useDashboard";

interface Props {
  storage: DashboardData["storage"];
}

export const StorageIntegrityCard: React.FC<Props> = ({ storage }) => {
  if (storage.error) {
    return (
      <div className="p-6 rounded-[28px] glass-card border-rose-500/20 bg-rose-500/[0.02] flex items-center gap-4">
        <AlertTriangle size={20} className="text-rose-400 shrink-0" />
        <div>
          <p className="text-white font-bold text-sm">Storage Monitor Offline</p>
          <p className="text-white/40 text-xs mt-0.5">{storage.error}</p>
        </div>
      </div>
    );
  }

  const total = storage.totalClips ?? 0;
  const uploaded = storage.uploadedClips ?? 0;
  const failed = storage.failedClips ?? 0;
  const pending = storage.pendingClips ?? 0;
  const healthPct = total > 0 ? Math.round((uploaded / total) * 100) : 100;
  const isDegraded = storage.status === "degraded" || failed > 10;

  const tiles = [
    {
      label: "Total Clips",
      value: total.toLocaleString(),
      icon: Film,
      color: "text-primary",
    },
    {
      label: "Uploaded",
      value: uploaded.toLocaleString(),
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Failed",
      value: failed.toLocaleString(),
      icon: AlertCircle,
      color: failed > 0 ? "text-rose-400" : "text-white/30",
    },
    {
      label: "Pending",
      value: pending.toLocaleString(),
      icon: Clock,
      color: pending > 0 ? "text-amber-400" : "text-white/30",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className={`p-6 rounded-[28px] glass-card relative overflow-hidden transition-all duration-500 ${
        isDegraded
          ? "border-rose-500/20"
          : "border-white/5 hover:border-white/10"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_rgba(99,102,241,0.04),transparent_50%)] pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-1">
              Backblaze B2
            </p>
            <h2 className="text-base font-black text-white uppercase tracking-tight">
              Storage Integrity
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isDegraded ? "bg-rose-500" : "bg-emerald-500 animate-pulse"
              }`}
            />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">
              {isDegraded ? "Degraded" : "Healthy"}
            </span>
          </div>
        </div>

        {/* Health bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-white/30 uppercase tracking-widest">
              Storage Health
            </span>
            <span
              className={`text-xs font-black ${
                healthPct >= 90 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {healthPct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                healthPct >= 90 ? "bg-emerald-500" : "bg-rose-500"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${healthPct}%` }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile, i) => {
            const Icon = tile.icon;
            return (
              <motion.div
                key={tile.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06 }}
                className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-white/[0.04]"
              >
                <div
                  className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0 ${tile.color}`}
                >
                  <Icon size={13} />
                </div>
                <div>
                  <p className="text-[8px] text-white/30 uppercase tracking-widest leading-none mb-0.5">
                    {tile.label}
                  </p>
                  <p className="text-sm font-black text-white">{tile.value}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Provider + last sweep */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/[0.05]">
          <div className="flex items-center gap-2">
            <HardDrive size={11} className="text-white/20" />
            <span className="text-[9px] text-white/25 uppercase tracking-widest">
              {storage.provider ?? "B2"}
            </span>
          </div>
          {storage.lastSweptAt ? (
            <span className="text-[9px] text-white/20">
              Swept {new Date(storage.lastSweptAt).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-[9px] text-white/20">
              Sweep: trigger from diagnostics
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
