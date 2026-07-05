"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api";

export interface DashboardData {
  version: number;
  generatedAt: string;
  deployment: {
    environment?: string;
    branch?: string;
    commit?: string;
    buildTime?: string;
    startedAt?: string;
    schemaVersion?: string;
    versions?: {
      node?: string;
      ffmpeg?: string;
      ytDlp?: string;
      workerVersion?: string;
      downloadEngineVersion?: string;
    };
    health?: {
      workers?: string;
      database?: string;
      storage?: string;
    };
    error?: string;
  };
  workers: {
    healthy: boolean;
    workers: Array<{
      name: string;
      pid: number | null;
      running: boolean;
      stopped: boolean;
      restarts: number;
      uptimeSeconds: number | null;
    }>;
    error?: string;
  };
  pipeline: Array<{
    name: string;
    avgDurationMs?: number | null;
    failures24h?: number;
    status?: string;
    total24h?: number;
    completed24h?: number;
    failed24h?: number;
    processing?: number;
    queued?: number;
    successRate?: number;
    error?: string;
  }>;
  storage: {
    totalClips?: number;
    uploadedClips?: number;
    failedClips?: number;
    pendingClips?: number;
    lastSweptAt?: string | null;
    provider?: string;
    status?: string;
    error?: string;
  };
  providers: Array<{
    name: string;
    role: string;
    configured?: boolean;
    keyCount?: number;
    activeKeyIndex?: number;
    lastLatencyMs?: number | null;
    status: string;
    endpoint?: string;
    error?: string;
  }>;
  downloadStrategies: Array<{
    id: string;
    attempts: number;
    successes: number;
    successRate: number;
    avgSpeedMbps: number | null;
    avgDurationMs: number | null;
    topFailure: string | null;
    error?: string;
  }>;
}

export interface LiveData {
  version: number;
  generatedAt: string;
  workers: DashboardData["workers"];
  activeJobCount: number;
  processingJobs: Array<{
    id: string;
    status: string;
    progress: number;
    video_url?: string;
    updated_at: string;
  }>;
}

export interface AlertData {
  version: number;
  generatedAt: string;
  count: number;
  alerts: Array<{
    id: string;
    dbId: string;
    severity: "error" | "warning" | "info";
    title: string;
    detail: string;
    detectedAt: string;
    state: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  }>;
}

function makePoller<T>(path: string, intervalMs: number) {
  return function usePoll(enabled = true) {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
    const isMounted = useRef(true);

    const fetch_ = useCallback(async () => {
      try {
        const res = await authFetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: T = await res.json();
        if (isMounted.current) {
          setData(json);
          setError(null);
          setLastFetchedAt(new Date());
        }
      } catch (e: any) {
        if (isMounted.current) setError(e.message || "Fetch failed");
      } finally {
        if (isMounted.current) setLoading(false);
      }
    }, []);

    useEffect(() => {
      if (!enabled) return;
      isMounted.current = true;
      fetch_();
      if (intervalMs > 0) {
        const interval = setInterval(fetch_, intervalMs);
        return () => {
          isMounted.current = false;
          clearInterval(interval);
        };
      }
      return () => { isMounted.current = false; };
    }, [fetch_, enabled]);

    return { data, loading, error, lastFetchedAt, refresh: fetch_ };
  };
}

// Full dashboard: deployment info, pipeline, storage, AI providers, download strategies.
// Polled every 60s — these change slowly and each poll runs Supabase analytics queries.
export const useDashboard = makePoller<DashboardData>("/api/system/dashboard", 60_000);

// Live heartbeat: worker process state + active job count.
// Polled every 5s — in-memory only, zero Supabase queries.
export const useWorkerLive = makePoller<LiveData>("/api/system/live", 5_000);

// Operational alerts: derived from worker state, job failure rates, storage.
// Polled every 10s — lightweight Supabase COUNT queries.
export const useAlerts = makePoller<AlertData>("/api/system/alerts", 10_000);
