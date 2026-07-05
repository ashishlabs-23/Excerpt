"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { authFetch } from "@/lib/api";

export interface DashboardData {
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
    // summary fields
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

export function useDashboard(pollMs = 30000) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const isMounted = useRef(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await authFetch("/api/system/dashboard");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      if (isMounted.current) {
        setData(json);
        setError(null);
        setLastFetchedAt(new Date());
      }
    } catch (e: any) {
      if (isMounted.current) setError(e.message || "Failed to fetch dashboard");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetch_();
    const interval = setInterval(fetch_, pollMs);
    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [fetch_, pollMs]);

  return { data, loading, error, lastFetchedAt, refresh: fetch_ };
}
