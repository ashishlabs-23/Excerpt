import { IngestionStage } from '../src/workers/stages/IngestionStage';
import { TranscriptionStage } from '../src/workers/stages/TranscriptionStage';
import { CandidateStage } from '../src/workers/stages/CandidateStage';
import { PlanningStage } from '../src/workers/stages/PlanningStage';
import { QueueHealthGate } from '../src/services/QueueHealthGate';
import { RotatingProxyProvider } from '../src/services/download/ProxyProvider';
import { createDefaultContext } from '../src/services/intelligence/PipelineContext';

async function runVerification() {
  console.log('========================================================');
  console.log('🧪 VERIFYING MODULAR PIPELINE STAGES & ARCHITECTURE PILLARS');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, name: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // --- 1. Pillar 1: Queue & Worker Scalability ---
  console.log('--- Pillar 1: Queue & Worker Scalability ---');
  const capacity = QueueHealthGate.checkCapacity();
  assert(typeof capacity.allowed === 'boolean', 'QueueHealthGate.checkCapacity returns boolean allowed status');
  assert(typeof capacity.metrics.memoryFreeMB === 'number', 'QueueHealthGate tracks memoryFreeMB');
  assert(typeof capacity.metrics.diskFreeMB === 'number', 'QueueHealthGate tracks diskFreeMB');
  assert(capacity.metrics.memoryFreeMB > 0, `Memory free is positive (${capacity.metrics.memoryFreeMB} MB)`);

  const normalDelay = QueueHealthGate.getAdaptiveDelay(0);
  const backoffDelay = QueueHealthGate.getAdaptiveDelay(3);
  assert(normalDelay === 1500, `Snappy initial poll delay is 1500ms (got ${normalDelay}ms)`);
  assert(backoffDelay > normalDelay, `Adaptive backoff increases on empty polls (${backoffDelay}ms > ${normalDelay}ms)`);

  // --- 2. Pillar 3: Ingestion Resilience ---
  console.log('\n--- Pillar 3: Ingestion Resilience ---');
  const proxyProvider = new RotatingProxyProvider(['http://proxy1:8080', 'http://proxy2:8080']);
  const p1 = proxyProvider.getProxyUrl();
  const p2 = proxyProvider.getProxyUrl();
  const p3 = proxyProvider.getProxyUrl();
  assert(p1 === 'http://proxy1:8080', 'First proxy retrieved is proxy1');
  assert(p2 === 'http://proxy2:8080', 'Second proxy rotated to proxy2');
  assert(p3 === 'http://proxy1:8080', 'Round-robin wraps back to proxy1');

  proxyProvider.markFailed('http://proxy1:8080');
  const nextProxy = proxyProvider.getProxyUrl();
  assert(nextProxy === 'http://proxy2:8080', 'Rate-limited proxy placed into cooldown; proxy2 selected exclusively');

  // --- 3. Pillar 4: CandidateStage Modularity ---
  console.log('\n--- Pillar 4: CandidateStage Modularity ---');
  const candidateStage = new CandidateStage();
  const mockAiService: any = {
    detectClips: async () => [
      { id: 'c1', start_time: 0, end_time: 30, title: 'Viral Clip 1', virality_score: 95 },
    ],
  };
  const context = createDefaultContext('test_job');
  const candidateResult = await candidateStage.execute({
    jobId: 'test_job',
    videoUrl: 'https://youtube.com/watch?v=123',
    numClips: 1,
    sourceDuration: 120,
    transcriptionText: 'Hello world this is a test transcript for modular clipping.',
    segments: [{ text: 'Hello world', start: 0, end: 10 }],
    aiService: mockAiService,
    pipelineContext: context,
  });
  assert(candidateResult.success === true, 'CandidateStage executes successfully');
  assert(candidateResult.data?.candidates.length === 1, 'CandidateStage produces candidates array');
  assert(candidateResult.data?.candidates[0].id === 'c1', 'CandidateStage candidate ID matches');

  // --- 4. Pillar 4: PlanningStage Modularity & Minimum Duration Protocol ---
  console.log('\n--- Pillar 4: PlanningStage Modularity ---');
  const planningStage = new PlanningStage();
  const mockDb: any = {
    getRenderCache: async () => null,
    getSupabase: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
    saveClips: async () => true,
  };

  const clips = [
    {
      id: 'clip_valid',
      start_time: 10,
      end_time: 35,
      title: 'Valid Long Clip',
      virality_score: 85,
    },
    {
      id: 'clip_too_short',
      start_time: 10,
      end_time: 15, // 5s < 14.9s minimum
      title: 'Too Short Clip',
      virality_score: 50,
    },
  ];

  const planningResult = await planningStage.execute({
    jobId: 'test_job_planning',
    videoUrl: 'https://youtube.com/watch?v=123',
    clips,
    sourceDuration: 100,
    words: [],
    generationMode: 'ai',
    db: mockDb,
  });

  assert(planningResult.success === true, 'PlanningStage executes successfully');
  assert(planningResult.data?.dbClips.length === 1, 'PlanningStage pruned 5s clip violating 15s protocol');
  assert(planningResult.data?.dbClips[0].id === 'clip_valid', 'Valid clip persisted to plan');
  assert(planningResult.data?.pendingRenderJobs.length === 1, 'Render job generated for valid clip');

  // --- 5. PlanningStage L5 Render Cache Bypass ---
  console.log('\n--- PlanningStage L5 Render Cache Bypass ---');
  const mockDbWithCache: any = {
    getRenderCache: async () => ({
      storage_path: 's3://bucket/cached.mp4',
      thumbnail_path: 's3://bucket/thumb.jpg',
    }),
    getSupabase: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }),
    saveClips: async () => true,
  };

  const cacheBypassResult = await planningStage.execute({
    jobId: 'test_job_cached',
    videoUrl: 'https://youtube.com/watch?v=123',
    clips: [{ id: 'clip_cached', start_time: 10, end_time: 35, title: 'Cached Clip', virality_score: 95 }],
    sourceDuration: 100,
    words: [],
    generationMode: 'ai',
    db: mockDbWithCache,
  });

  assert(cacheBypassResult.success === true, 'PlanningStage cache bypass execution succeeded');
  assert(cacheBypassResult.data?.dbClips[0].status === 'uploaded', 'Cached clip marked as uploaded immediately');
  assert(cacheBypassResult.data?.pendingRenderJobs.length === 0, 'No render jobs queued for cached clip');

  console.log('\n========================================================');
  console.log(`📊 SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('Verification suite encountered unexpected error:', err);
  process.exit(1);
});
