import { createRenderPlan, DeliveryValidator, DEFAULT_PIPELINE_CONFIG } from '@excerpt/clipping-core';

async function testRenderPlanVerification() {
  console.log('=== Starting RenderPlan Contract & DeliveryValidator Verification ===\n');

  let passed = 0;
  let total = 0;

  // Test 1: RenderPlan creation from 5 requested, 2 accepted candidates
  total++;
  console.log('Test 1: Creating RenderPlan (Requested: 5, Accepted: 2)...');
  const plan = createRenderPlan({
    jobId: 'job_test_001',
    requestedClips: 5,
    acceptedClips: [{ id: 'clip_a' }, { id: 'clip_b' }],
  });

  if (
    plan.requestedClips === 5 &&
    plan.acceptedCandidates === 2 &&
    plan.renderJobs.length === 2 &&
    plan.renderJobs[0].clipId === 'clip_a' &&
    plan.renderJobs[1].clipId === 'clip_b'
  ) {
    console.log(`✅ Test 1 PASSED: RenderPlan scheduled exactly 2 render jobs for 5 requested clips.`);
    passed++;
  } else {
    console.error(`❌ Test 1 FAILED: Invalid plan output:`, plan);
  }

  // Test 2: Delivery Validation Funnel
  total++;
  console.log('\nTest 2: Validating Delivery Funnel with 2 rendered & uploaded clips...');
  const deliveryReport = DeliveryValidator.validate(plan, [
    { clipId: 'clip_a', videoUrl: 'https://b2.com/clip_a.mp4', isPlayable: true, storageVerified: true },
    { clipId: 'clip_b', videoUrl: 'https://b2.com/clip_b.mp4', isPlayable: true, storageVerified: true },
  ]);

  if (
    deliveryReport.pass === true &&
    deliveryReport.requested === 5 &&
    deliveryReport.accepted === 2 &&
    deliveryReport.scheduled === 2 &&
    deliveryReport.rendered === 2 &&
    deliveryReport.playable === 2
  ) {
    console.log(`✅ Test 2 PASSED: Delivery validation report passed all metrics contract.`);
    passed++;
  } else {
    console.error(`❌ Test 2 FAILED: Invalid report output:`, deliveryReport);
  }

  // Test 3: Default Pipeline Config
  total++;
  console.log('\nTest 3: Checking DEFAULT_PIPELINE_CONFIG constants (no magic numbers)...');
  if (DEFAULT_PIPELINE_CONFIG.defaultClipCount === 3) {
    console.log(`✅ Test 3 PASSED: DEFAULT_PIPELINE_CONFIG defaultClipCount = ${DEFAULT_PIPELINE_CONFIG.defaultClipCount}`);
    passed++;
  } else {
    console.error(`❌ Test 3 FAILED: Invalid config.`);
  }

  console.log(`\n==================================================`);
  console.log(`RenderPlan Verification: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

testRenderPlanVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
