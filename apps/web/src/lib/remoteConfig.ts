"use client";

import { useState, useEffect } from "react";

export interface PipelineConfigDefaults {
  minCandidateScore: number;
  defaultClipsCount: number;
  hookWeight: number;
  storyWeight: number;
  maxVideoDurationSeconds: number;
  preferredAspectRatio: "9:16" | "1:1" | "16:9";
  enableLiveAnalysis: boolean;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfigDefaults = {
  minCandidateScore: 0.65,
  defaultClipsCount: 3,
  hookWeight: 0.40,
  storyWeight: 0.35,
  maxVideoDurationSeconds: 1800,
  preferredAspectRatio: "9:16",
  enableLiveAnalysis: true,
};

export function useRemoteConfig() {
  const [config, setConfig] = useState<PipelineConfigDefaults>(DEFAULT_PIPELINE_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In production, fetch dynamic parameter overrides from Firestore/Remote Config endpoint
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/system/remote-config");
        if (res.ok) {
          const data = await res.json();
          setConfig(prev => ({ ...prev, ...data }));
        }
      } catch (err) {
        // Fallback to default
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  return { config, loading };
}
