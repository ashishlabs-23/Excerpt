import dotenv from 'dotenv';
import path from 'path';
import { AnalysisCacheService } from '../src/services/analysis_cache_service';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function runCacheBenchmark() {
  console.log("=================================================");
  console.log("    EXCERPT PERFORMANCE & CACHE BENCHMARK       ");
  console.log("=================================================");

  const cacheService = AnalysisCacheService.getInstance();
  const testUrl = 'https://youtu.be/benchmark_test_video_123';
  const duration = 120;
  const title = 'Test Benchmark Video';
  const channel = 'Excerpt Benchmark';
  
  const requiredVersions = {
    analysis_version: '3.0',
    ranking_version: '2.1',
    render_version: '1.7',
  };

  const videoHash = cacheService.generateVideoHash(testUrl, duration, title, channel);
  console.log(`[Benchmark] Generated video hash: ${videoHash}`);

  // Ensure clean state for test run
  console.log(`[Benchmark] Invalidating any pre-existing cache for ${videoHash}...`);
  await cacheService.invalidateCache(videoHash);

  // Run 1: Expected Cache Miss
  console.log("\n--- Run 1: Initial Generation (Cache Miss Expected) ---");
  const run1 = await cacheService.getCache(videoHash, requiredVersions);
  const isRun1Miss = !run1.rawAnalysis && !run1.candidateMoments;
  console.log(`Run 1 Result: ${isRun1Miss ? '✅ CACHE MISS (PASS)' : '❌ CACHE HIT (FAIL)'}`);

  // Populate Cache
  console.log("\n[Benchmark] Writing dummy analysis results to Cache...");
  const dummyAnalysis = {
    rawAnalysis: {
      transcript: "This is a test transcript for caching benchmark.",
      segments: [{ id: "seg1", text: "test transcript", start: 0, end: 10 }],
      words: [{ word: "this", start: 0, end: 1 }],
      category: { category: 'podcast', confidence: 1.0, fallback_used: false, signals: {} }
    },
    candidateMoments: [
      { id: "moment1", start_time: 0, end_time: 10, title: "Moment 1", caption: "test transcript" }
    ],
    renderPlans: [
      { id: "moment1", title: "Moment 1", start_time: 0, end_time: 10 }
    ]
  };

  await cacheService.setCache(videoHash, requiredVersions, dummyAnalysis);

  // Run 2-4: Cache Hits Expected
  let cacheHitCount = 0;
  const totalRuns = 3;

  for (let runIdx = 2; runIdx <= 4; runIdx++) {
    console.log(`\n--- Run ${runIdx}: Repeat Request (Cache Hit Expected) ---`);
    const runResult = await cacheService.getCache(videoHash, requiredVersions);
    const isHit = !!(runResult.rawAnalysis && runResult.candidateMoments);
    console.log(`Run ${runIdx} Result: ${isHit ? '✅ CACHE HIT (PASS)' : '❌ CACHE MISS (FAIL)'}`);
    if (isHit) {
      cacheHitCount++;
    }
  }

  const cacheHitRate = (cacheHitCount / totalRuns) * 100;
  console.log("\n=================================================");
  console.log(`Target Cache Hit Rate (Runs 2-4): > 90%`);
  console.log(`Actual Cache Hit Rate: ${cacheHitRate}%`);
  console.log("=================================================");

  // Cleanup cache after benchmark
  console.log(`[Benchmark] Cleaning up cache...`);
  await cacheService.invalidateCache(videoHash);

  if (isRun1Miss && cacheHitRate > 90) {
    console.log("\n🎉 CACHE VALIDATION BENCHMARK PASSED!");
    process.exit(0);
  } else {
    console.error("\n❌ CACHE VALIDATION BENCHMARK FAILED!");
    process.exit(1);
  }
}

runCacheBenchmark().catch((err) => {
  console.error("Cache benchmark execution crashed:", err);
  process.exit(1);
});
