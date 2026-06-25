import { PipelineContext } from './PipelineContext';

export interface ABTestReport {
  jobId: string;
  v1ClipsCount: number;
  v2ClipsCount: number;
  v1AvgScore: number;
  v2AvgScore: number;
  eventsDetected: string[];
}

export class ABTestFramework {
  /**
   * Generates a comparative report between V1 and V2 pipelines.
   */
  public async generateReport(v1Result: any, v2Context: PipelineContext): Promise<ABTestReport> {
    const v1ClipsCount = v1Result?.clips?.length || 0;
    const v2ClipsCount = v2Context?.events?.length || 0;

    const v1AvgScore = v1Result?.clips?.reduce((sum: number, c: any) => sum + (c.virality_score || 0), 0) / (v1ClipsCount || 1);
    const v2AvgScore = v2Context?.events?.reduce((sum: number, e: any) => sum + (e.confidence * 100), 0) / (v2ClipsCount || 1);

    return {
      jobId: v2Context.jobId,
      v1ClipsCount,
      v2ClipsCount,
      v1AvgScore: Number(v1AvgScore.toFixed(2)),
      v2AvgScore: Number(v2AvgScore.toFixed(2)),
      eventsDetected: v2Context.events.map((e) => `${e.type} (${e.start.toFixed(1)}s)`),
    };
  }
}
export const abTestFramework = new ABTestFramework();
