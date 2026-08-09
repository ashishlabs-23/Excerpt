import { StageExecutor, ErrorCategory, PipelineError } from '@excerpt/clipping-core';

async function testResilienceHarness() {
  console.log('=== Starting End-to-End Resilience & StageExecutor Verification Harness ===\n');

  let passed = 0;
  let total = 0;

  // Test 1: API Timeout Injection
  total++;
  try {
    console.log('Test 1: Injecting API Timeout into StageExecutor...');
    await StageExecutor.run('input', {
      stage: 'injected_api_stage',
      component: 'ResilienceHarness',
      provider: 'Groq',
      timeoutMs: 100,
      timeoutType: 'api_timeout',
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return 'done';
      },
    });
    console.error('❌ Test 1 FAILED: StageExecutor did not time out as expected.');
  } catch (err: any) {
    if (err instanceof PipelineError && err.category === ErrorCategory.TIMEOUT && err.timeoutType === 'api_timeout') {
      console.log(`✅ Test 1 PASSED: Caught PipelineError (TIMEOUT / api_timeout). Suggested fix: "${err.suggestedFix}"`);
      passed++;
    } else {
      console.error('❌ Test 1 FAILED: Unexpected error type:', err);
    }
  }

  // Test 2: Input Validation Failure
  total++;
  try {
    console.log('\nTest 2: Injecting Input Validation Failure...');
    await StageExecutor.run('', {
      stage: 'validation_stage',
      component: 'ResilienceHarness',
      validateInput: (inp) => inp.length > 0,
      execute: async () => 'result',
    });
    console.error('❌ Test 2 FAILED: Validation did not reject empty input.');
  } catch (err: any) {
    if (err instanceof PipelineError) {
      console.log(`✅ Test 2 PASSED: Caught PipelineError for input validation.`);
      passed++;
    } else {
      console.error('❌ Test 2 FAILED: Unexpected error type:', err);
    }
  }

  // Test 3: Output Contract Validation Failure
  total++;
  try {
    console.log('\nTest 3: Injecting Output Validation Contract Failure...');
    await StageExecutor.run('valid', {
      stage: 'output_validation_stage',
      component: 'ResilienceHarness',
      execute: async () => [],
      validateOutput: (out) => Array.isArray(out) && out.length > 0,
    });
    console.error('❌ Test 3 FAILED: Output contract did not reject empty array.');
  } catch (err: any) {
    if (err instanceof PipelineError) {
      console.log(`✅ Test 3 PASSED: Caught PipelineError for output validation contract.`);
      passed++;
    } else {
      console.error('❌ Test 3 FAILED: Unexpected error type:', err);
    }
  }

  // Test 4: Retry Policy with Eventually Successful Recovery
  total++;
  try {
    console.log('\nTest 4: Testing Retry Policy with Transient Failure Recovery...');
    let attempts = 0;
    const res = await StageExecutor.run('data', {
      stage: 'retry_stage',
      component: 'ResilienceHarness',
      maxRetries: 3,
      retryDelayMs: 50,
      execute: async () => {
        attempts++;
        if (attempts < 2) {
          throw new PipelineError({
            message: 'Transient HTTP 429',
            category: ErrorCategory.RATE_LIMIT,
            retryable: true,
          });
        }
        return 'recovered';
      },
    });

    if (res === 'recovered' && attempts === 2) {
      console.log(`✅ Test 4 PASSED: Successfully recovered after attempt ${attempts}.`);
      passed++;
    } else {
      console.error(`❌ Test 4 FAILED: Unexpected outcome (attempts: ${attempts}, res: ${res})`);
    }
  } catch (err: any) {
    console.error('❌ Test 4 FAILED:', err);
  }

  // Test 5: Stage Health Registry Tracking
  total++;
  console.log('\nTest 5: Checking Stage Health Monitoring...');
  const health = StageExecutor.getHealth('injected_api_stage') as any;
  if (health && health.stage === 'injected_api_stage') {
    console.log(`✅ Test 5 PASSED: Stage health registered: status=${health.status}, successRate=${health.successRate}`);
    passed++;
  } else {
    console.error('❌ Test 5 FAILED: Stage health not registered.');
  }

  console.log(`\n==================================================`);
  console.log(`Resilience Harness Verification: ${passed}/${total} PASSED`);
  console.log(`==================================================`);

  if (passed !== total) {
    process.exit(1);
  }
}

testResilienceHarness().catch((err) => {
  console.error('Fatal harness crash:', err);
  process.exit(1);
});
