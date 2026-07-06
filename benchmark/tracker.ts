import fs from 'fs';
import path from 'path';

export interface BenchmarkMetrics {
  timestamp: string;
  commit?: string;
  download_latency_ms: number[];
  transcription_latency_ms: number[];
  ai_latency_ms: number[];
  render_latency_ms: number[];
  upload_latency_ms: number[];
  upload_size_bytes: number[];
  failure_rate_percent: number;
  throughput_jobs_per_hour: number;
  cpu_usage_percent?: number;
  memory_usage_mb?: number;
}

export interface AggregatedMetrics {
  median: number;
  p95: number;
  p99: number;
}

function calculatePercentile(data: number[], percentile: number): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function aggregate(data: number[]): AggregatedMetrics {
  return {
    median: calculatePercentile(data, 50),
    p95: calculatePercentile(data, 95),
    p99: calculatePercentile(data, 99)
  };
}

export function compareRuns(current: BenchmarkMetrics, previous: BenchmarkMetrics) {
  const currentAgg = {
    download: aggregate(current.download_latency_ms),
    render: aggregate(current.render_latency_ms),
    // ...
  };
  
  const previousAgg = {
    download: aggregate(previous.download_latency_ms),
    render: aggregate(previous.render_latency_ms),
    // ...
  };

  const getDelta = (curr: number, prev: number) => {
    if (prev === 0) return '+0%';
    const delta = ((curr - prev) / prev) * 100;
    return (delta > 0 ? '+' : '') + delta.toFixed(1) + '%';
  };

  console.log('=== Performance Regression Report ===');
  console.log(`Download (Median): ${currentAgg.download.median}ms | Prev: ${previousAgg.download.median}ms | Diff: ${getDelta(currentAgg.download.median, previousAgg.download.median)}`);
  console.log(`Render (Median): ${currentAgg.render.median}ms | Prev: ${previousAgg.render.median}ms | Diff: ${getDelta(currentAgg.render.median, previousAgg.render.median)}`);
  
  // Can add alerting if regression > 10%
}

export function saveMetrics(metrics: BenchmarkMetrics) {
  const historyFile = path.join(__dirname, 'history.json');
  let history: BenchmarkMetrics[] = [];
  if (fs.existsSync(historyFile)) {
    history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  }
  
  if (history.length > 0) {
    compareRuns(metrics, history[history.length - 1]);
  }
  
  history.push(metrics);
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
}
