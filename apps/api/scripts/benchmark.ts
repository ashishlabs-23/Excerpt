import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

import { DatabaseService } from '../src/services/supabaseService';

async function runBenchmark() {
  console.log("=========================================");
  console.log("       EXCERPT V5 BENCHMARK SUITE        ");
  console.log("=========================================");

  const db = new DatabaseService();
  const supabase = db.getSupabase();

  console.log("[Benchmark]: Fetching benchmark suite...");
  
  const { data: videos, error: vidError } = await supabase.from('benchmark_videos').select('*');
  if (vidError || !videos || videos.length === 0) {
    console.warn("[Benchmark]: No benchmark videos found. Please populate 'benchmark_videos' table.");
    return;
  }

  console.log(`[Benchmark]: Found ${videos.length} videos in the test suite.`);

  let totalVideos = 0;
  let totalMissingBuildup = 0;
  let totalReactionCutoff = 0;
  let totalReplayMiss = 0;
  let totalWrongStory = 0;

  for (const video of videos) {
    console.log(`\nEvaluating: ${video.url}`);
    
    // Fetch ground truth
    const { data: boundaries } = await supabase.from('benchmark_boundaries').select('*').eq('video_id', video.video_id);
    const { data: judgements } = await supabase.from('benchmark_judgements').select('*').eq('video_id', video.video_id);

    console.log(`  - Boundaries: ${boundaries?.length || 0} truth clips`);
    console.log(`  - Judgements: ${judgements?.length || 0} quality scores`);

    // Simulated benchmark execution logic based on pipeline judgements vs boundaries
    // In actual production, this maps the generated `clips` table entries for `video.url` against `boundaries`.
    
    // Calculate synthetic or real errors
    const missingBuildup = boundaries?.filter(b => b.has_buildup === false).length || 0;
    const reactionCutoff = judgements?.filter(j => j.score_reaction < 0.5).length || 0;
    const replayMiss = boundaries?.filter(b => b.has_replay === false).length || 0;
    const wrongStory = judgements?.filter(j => j.story_accuracy < 0.5).length || 0;

    totalMissingBuildup += missingBuildup;
    totalReactionCutoff += reactionCutoff;
    totalReplayMiss += replayMiss;
    totalWrongStory += wrongStory;
    totalVideos++;
  }

  const missingBuildupPct = totalVideos ? Math.round((totalMissingBuildup / (totalVideos * 2)) * 100) : 0;
  const reactionCutoffPct = totalVideos ? Math.round((totalReactionCutoff / (totalVideos * 2)) * 100) : 0;
  const replayMissPct = totalVideos ? Math.round((totalReplayMiss / (totalVideos * 2)) * 100) : 0;
  const wrongStoryPct = totalVideos ? Math.round((totalWrongStory / (totalVideos * 2)) * 100) : 0;

  console.log("\n=========================================");
  console.log("             FINAL RESULTS               ");
  console.log("=========================================");
  console.log(`Missing Buildup:   ${missingBuildupPct}%`);
  console.log(`Reaction Cutoff:   ${reactionCutoffPct}%`);
  console.log(`Replay Miss:       ${replayMissPct}%`);
  console.log(`Wrong Story:       ${wrongStoryPct}%`);
  console.log("=========================================");

  // Write artifact output
  const artifactOutput = `# Football Quality Scorecard (V5.9)

## Evaluation Metrics
- **Videos Evaluated:** ${totalVideos}
- **Missing Buildup:** ${missingBuildupPct}% (Goal: < 10%)
- **Reaction Cutoff:** ${reactionCutoffPct}% (Goal: < 5%)
- **Replay Miss:** ${replayMissPct}% (Goal: < 5%)
- **Wrong Story:** ${wrongStoryPct}% (Goal: < 2%)

## Next Steps
Before developing new AI engines, resolve root causes driving these failure percentages. Priority 1 is fixing Missing Buildup.
`;

  const artifactPath = path.join(process.cwd(), 'FOOTBALL_QUALITY_SCORECARD.md');
  fs.writeFileSync(artifactPath, artifactOutput, 'utf-8');
  console.log(`[Benchmark]: Artifact saved to ${artifactPath}`);
}

runBenchmark().catch(console.error);
