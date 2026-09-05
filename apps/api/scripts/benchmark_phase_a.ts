import { EditorialPlanEvaluator } from '../src/services/intelligence/EditorialPlanEvaluator';
import { ContextCoherenceGuard } from '../src/services/intelligence/ContextCoherenceGuard';
import { PayoffDetectionEngine } from '../src/services/intelligence/PayoffDetectionEngine';

interface BaselineCandidate {
  candidate_id: string;
  original_start: number;
  original_end: number;
  original_transcript: string;
  original_score: number;
  words: Array<{ word: string; start: number; end: number }>;
}

async function runPhaseABenchmark() {
  console.log('================================================================');
  console.log('  EXCERPT PHASE A BENCHMARK: EDITORIAL DECISION EVALUATION');
  console.log('  Weights: Payoff 45% | Hook 35% | Coherence 20%');
  console.log('================================================================\n');

  const evaluator = new EditorialPlanEvaluator(
    new ContextCoherenceGuard(),
    new PayoffDetectionEngine(),
    { payoff: 0.45, hook: 0.35, coherence: 0.20 }
  );

  // Curated representative test candidates simulating real-world clipping scenarios
  const candidates: BaselineCandidate[] = [
    // 1. Conversational preamble followed by sharp thesis & complete payoff
    {
      candidate_id: 'cand-001-preamble-to-thesis',
      original_start: 0.0,
      original_end: 16.0,
      original_score: 72,
      original_transcript: 'So basically we lost two million dollars in one day and nobody knew what happened next until we realized that the cloud servers were deleted.',
      words: [
        { word: 'So', start: 0.0, end: 0.3 },
        { word: 'basically', start: 0.4, end: 0.9 },
        { word: 'we', start: 1.2, end: 1.4 },
        { word: 'lost', start: 1.5, end: 1.8 },
        { word: 'two', start: 1.9, end: 2.1 },
        { word: 'million', start: 2.2, end: 2.6 },
        { word: 'dollars', start: 2.7, end: 3.2 },
        { word: 'in', start: 3.3, end: 3.5 },
        { word: 'one', start: 3.6, end: 3.8 },
        { word: 'day', start: 3.9, end: 4.2 },
        { word: 'and', start: 4.5, end: 4.7 },
        { word: 'nobody', start: 4.8, end: 5.2 },
        { word: 'knew', start: 5.3, end: 5.6 },
        { word: 'what', start: 5.7, end: 5.9 },
        { word: 'happened', start: 6.0, end: 6.5 },
        { word: 'next', start: 6.6, end: 7.0 },
        { word: 'until', start: 7.5, end: 7.8 },
        { word: 'we', start: 7.9, end: 8.1 },
        { word: 'realized', start: 8.2, end: 8.7 },
        { word: 'that', start: 8.8, end: 9.0 },
        { word: 'the', start: 9.1, end: 9.3 },
        { word: 'cloud', start: 9.4, end: 9.8 },
        { word: 'servers', start: 9.9, end: 10.5 },
        { word: 'were', start: 10.6, end: 10.8 },
        { word: 'deleted.', start: 10.9, end: 11.5 },
      ],
    },
    // 2. Strong hook opening, but cuts off mid-explanation without resolving promise (CLIFFHANGER)
    {
      candidate_id: 'cand-002-strong-hook-incomplete-payoff',
      original_start: 0.0,
      original_end: 8.0,
      original_score: 88, // Unearned high score based purely on keywords
      original_transcript: 'The biggest mistake you make when pitching investors is you explain the tech because',
      words: [
        { word: 'The', start: 0.0, end: 0.2 },
        { word: 'biggest', start: 0.3, end: 0.7 },
        { word: 'mistake', start: 0.8, end: 1.3 },
        { word: 'you', start: 1.4, end: 1.6 },
        { word: 'make', start: 1.7, end: 2.0 },
        { word: 'when', start: 2.1, end: 2.4 },
        { word: 'pitching', start: 2.5, end: 2.9 },
        { word: 'investors', start: 3.0, end: 3.6 },
        { word: 'is', start: 3.7, end: 3.9 },
        { word: 'you', start: 4.0, end: 4.2 },
        { word: 'explain', start: 4.3, end: 4.8 },
        { word: 'the', start: 4.9, end: 5.1 },
        { word: 'tech', start: 5.2, end: 5.6 },
        { word: 'because', start: 5.7, end: 6.2 },
        // Resolution is only available in future words at 14s
        { word: 'they', start: 14.0, end: 14.2 },
        { word: 'only', start: 14.3, end: 14.6 },
        { word: 'care', start: 14.7, end: 15.0 },
        { word: 'about', start: 15.1, end: 15.3 },
        { word: 'distribution.', start: 15.4, end: 16.2 },
      ],
    },
    // 3. Weak conversational hook + Complete resolution
    {
      candidate_id: 'cand-003-weak-hook-strong-payoff',
      original_start: 0.0,
      original_end: 18.0,
      original_score: 65,
      original_transcript: 'Well okay we tested the algorithm on ten thousand users and the result is conversions jumped forty percent.',
      words: [
        { word: 'Well', start: 0.0, end: 0.3 },
        { word: 'okay', start: 0.4, end: 0.8 },
        { word: 'we', start: 1.0, end: 1.2 },
        { word: 'tested', start: 1.3, end: 1.7 },
        { word: 'the', start: 1.8, end: 2.0 },
        { word: 'algorithm', start: 2.1, end: 2.7 },
        { word: 'on', start: 2.8, end: 3.0 },
        { word: 'ten', start: 3.1, end: 3.3 },
        { word: 'thousand', start: 3.4, end: 3.8 },
        { word: 'users', start: 3.9, end: 4.4 },
        { word: 'and', start: 4.8, end: 5.0 },
        { word: 'the', start: 5.1, end: 5.3 },
        { word: 'result', start: 5.4, end: 5.9 },
        { word: 'is', start: 6.0, end: 6.2 },
        { word: 'conversions', start: 6.3, end: 7.0 },
        { word: 'jumped', start: 7.1, end: 7.5 },
        { word: 'forty', start: 7.6, end: 8.0 },
        { word: 'percent.', start: 8.1, end: 8.7 },
      ],
    },
    // 4. Already perfect hook & complete story (should need only Raw variant)
    {
      candidate_id: 'cand-004-already-punchy-and-resolved',
      original_start: 0.0,
      original_end: 14.0,
      original_score: 82,
      original_transcript: 'Why did Apple abandon the electric car project after spending ten billion dollars? Because ultimately they realized autonomy was impossible.',
      words: [
        { word: 'Why', start: 0.0, end: 0.3 },
        { word: 'did', start: 0.4, end: 0.6 },
        { word: 'Apple', start: 0.7, end: 1.1 },
        { word: 'abandon', start: 1.2, end: 1.7 },
        { word: 'the', start: 1.8, end: 2.0 },
        { word: 'electric', start: 2.1, end: 2.6 },
        { word: 'car', start: 2.7, end: 3.0 },
        { word: 'project', start: 3.1, end: 3.6 },
        { word: 'after', start: 3.7, end: 4.0 },
        { word: 'spending', start: 4.1, end: 4.6 },
        { word: 'ten', start: 4.7, end: 4.9 },
        { word: 'billion', start: 5.0, end: 5.5 },
        { word: 'dollars?', start: 5.6, end: 6.1 },
        { word: 'Because', start: 6.5, end: 6.9 },
        { word: 'ultimately', start: 7.0, end: 7.6 },
        { word: 'they', start: 7.7, end: 7.9 },
        { word: 'realized', start: 8.0, end: 8.5 },
        { word: 'autonomy', start: 8.6, end: 9.2 },
        { word: 'was', start: 9.3, end: 9.5 },
        { word: 'impossible.', start: 9.6, end: 10.3 },
      ],
    },
    // 5. KEY TEST: Strong hook + Unresolvable cliffhanger (no payoff available anywhere)
    {
      candidate_id: 'cand-005-strong-hook-unresolvable-cliffhanger',
      original_start: 0.0,
      original_end: 6.0,
      original_score: 95, // High deceptive score based on hook
      original_transcript: 'The biggest secret nobody tells you about raising venture capital is you never admit that',
      words: [
        { word: 'The', start: 0.0, end: 0.2 },
        { word: 'biggest', start: 0.3, end: 0.7 },
        { word: 'secret', start: 0.8, end: 1.2 },
        { word: 'nobody', start: 1.3, end: 1.6 },
        { word: 'tells', start: 1.7, end: 1.9 },
        { word: 'you', start: 2.0, end: 2.2 },
        { word: 'about', start: 2.3, end: 2.5 },
        { word: 'raising', start: 2.6, end: 3.0 },
        { word: 'venture', start: 3.1, end: 3.5 },
        { word: 'capital', start: 3.6, end: 4.0 },
        { word: 'is', start: 4.1, end: 4.3 },
        { word: 'you', start: 4.4, end: 4.6 },
        { word: 'never', start: 4.7, end: 5.0 },
        { word: 'admit', start: 5.1, end: 5.5 },
        { word: 'that', start: 5.6, end: 5.9 }, // Cuts off on trailing conjunction 'that' with no future words!
      ],
    }
  ];

  console.log(`Evaluating ${candidates.length} baseline candidates against Phase A Editorial Model...\n`);

  const results = candidates.map(c => {
    const plan = evaluator.evaluateCandidate(
      c.candidate_id,
      c.original_start,
      c.original_end,
      c.words
    );

    const winner = plan.winningVariant;
    const raw = plan.allVariants.find(v => v.variantId === 'raw')!;

    return {
      candidate_id: c.candidate_id,
      accepted: plan.accepted,
      rejection_reason: plan.rejectionReason,
      winning_variant: winner.variantId,
      variants_generated: plan.allVariants.map(v => v.variantId).join(', '),
      original_start: c.original_start,
      original_end: c.original_end,
      original_duration: c.original_end - c.original_start,
      new_start: winner.startSec,
      new_end: winner.endSec,
      new_duration: winner.durationSec,
      start_delta: Number((winner.startSec - c.original_start).toFixed(2)),
      end_delta: Number((winner.endSec - c.original_end).toFixed(2)),
      duration_delta: Number((winner.durationSec - (c.original_end - c.original_start)).toFixed(2)),
      raw_hook: raw.hookScore,
      new_hook: winner.hookScore,
      hook_delta: Number((winner.hookScore - raw.hookScore).toFixed(1)),
      raw_payoff: raw.payoffScore,
      new_payoff: winner.payoffScore,
      payoff_delta: Number((winner.payoffScore - raw.payoffScore).toFixed(1)),
      coherence_score: winner.coherenceScore,
      composite_score: winner.compositeScore,
      explanation: winner.explanation,
    };
  });

  console.table(results.map(r => ({
    Candidate: r.candidate_id,
    Status: r.accepted ? 'ACCEPTED' : 'REJECTED',
    Winner: r.winning_variant,
    Variants: r.variants_generated,
    'Start Delta': `${r.start_delta}s`,
    'End Delta': `${r.end_delta}s`,
    'Hook Δ': `+${r.hook_delta}`,
    'Payoff Δ': `+${r.payoff_delta}`,
    Composite: r.composite_score,
  })));

  console.log('\nDetailed Breakdown:\n');
  results.forEach(r => {
    console.log(`[${r.candidate_id}]`);
    console.log(`  - Status: ${r.accepted ? 'ACCEPTED' : 'REJECTED: ' + r.rejection_reason}`);
    console.log(`  - Winning Variant: ${r.winning_variant} (Composite: ${r.composite_score})`);
    console.log(`  - Hook Score: ${r.raw_hook} -> ${r.new_hook} (Δ: ${r.hook_delta})`);
    console.log(`  - Payoff Score: ${r.raw_payoff} -> ${r.new_payoff} (Δ: ${r.payoff_delta})`);
    console.log(`  - Boundary: [${r.original_start}s - ${r.original_end}s] -> [${r.new_start}s - ${r.new_end}s]`);
    console.log(`  - Explanation: ${r.explanation}\n`);
  });

  // Acceptance Criteria Validations
  console.log('----------------------------------------------------------------');
  console.log('ACCEPTANCE CRITERIA VALIDATIONS:');

  // Test 1: Preamble candidate should pick hook_adjusted
  const cand1 = results.find(r => r.candidate_id === 'cand-001-preamble-to-thesis')!;
  const test1Passed = cand1.winning_variant === 'hook_adjusted' && cand1.hook_delta > 0 && cand1.new_start >= 1.2;
  console.log(`✓ 1. Preamble stripped & hook sharpened on weak opening: ${test1Passed ? 'PASS' : 'FAIL'}`);

  // Test 2: Incomplete payoff must be extended or rejected (never accepted as raw cliffhanger)
  const cand2 = results.find(r => r.candidate_id === 'cand-002-strong-hook-incomplete-payoff')!;
  const test2Passed = cand2.winning_variant === 'payoff_extended' || !cand2.accepted;
  console.log(`✓ 2. Broken narrative payoff prevented / resolved: ${test2Passed ? 'PASS' : 'FAIL'}`);

  // Test 3: Already punchy clip generates only necessary variants (raw)
  const cand4 = results.find(r => r.candidate_id === 'cand-004-already-punchy-and-resolved')!;
  const test3Passed = cand4.winning_variant === 'raw' && cand4.variants_generated === 'raw';
  console.log(`✓ 3. Candidate-dependent variant generation (no unnecessary variants): ${test3Passed ? 'PASS' : 'FAIL'}`);

  // Test 4: Key Test: Incomplete payoff rejected over valid narrative
  const cand3 = results.find(r => r.candidate_id === 'cand-003-weak-hook-strong-payoff')!;
  const test4Passed = cand3.accepted && cand3.composite_score >= 60;
  console.log(`✓ 4. Narrative completeness prioritized (no cliffhanger duds): ${test4Passed ? 'PASS' : 'FAIL'}`);

  // Test 5: Key Invariant: Strong hook with unresolvable cliffhanger must be REJECTED
  const cand5 = results.find(r => r.candidate_id === 'cand-005-strong-hook-unresolvable-cliffhanger')!;
  const test5Passed = !cand5.accepted && cand3.accepted;
  console.log(`✓ 5. Broken narrative strictly rejected even with 95+ hook score: ${test5Passed ? 'PASS' : 'FAIL'}`);
  console.log('----------------------------------------------------------------\n');
}

runPhaseABenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
