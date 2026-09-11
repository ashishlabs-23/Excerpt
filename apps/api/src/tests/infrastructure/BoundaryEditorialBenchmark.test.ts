import { BoundaryEditorialBenchmark } from '../../benchmarks/BoundaryEditorialBenchmark';

describe('P4.6 Boundary Editorial A/B Acceptance Benchmark', () => {
  const report = BoundaryEditorialBenchmark.runBenchmark();

  it('Gate 1: Zero-Truncation Invariant — Canonical Mid-Word Cut Rate is exactly 0%', () => {
    console.log(`[Benchmark]: Mid-Word Cut Rate -> Legacy: ${report.metrics.legacyMidWordRate}%, Canonical: ${report.metrics.canonicalMidWordRate}%`);
    expect(report.metrics.canonicalMidWordRate).toBe(0.0);
  });

  it('Gate 2: Payoff Integrity Invariant — Canonical Payoff Truncation Rate is exactly 0%', () => {
    console.log(`[Benchmark]: Payoff Truncation Rate -> Legacy: ${report.metrics.legacyPayoffTruncationRate}%, Canonical: ${report.metrics.canonicalPayoffTruncationRate}%`);
    expect(report.metrics.canonicalPayoffTruncationRate).toBe(0.0);
  });

  it('Gate 3: Editorial Preference Superiority — Canonical Win Rate >= 80%', () => {
    console.log(`[Benchmark]: Editorial Win Rate -> Canonical Wins: ${report.canonicalWins}/${report.scenariosCount} (${report.metrics.canonicalWinRate}%), Legacy Wins: ${report.legacyWins}, Ties: ${report.ties}`);
    expect(report.metrics.canonicalWinRate).toBeGreaterThanOrEqual(80.0);
    expect(report.legacyWins).toBe(0);
  });

  it('Gate 4: Scenario 1 (Complete Thought) prioritizes 13.2s thought over 15.0s forced clamping', () => {
    const sc1 = report.evaluations.find(e => e.scenarioId === 'scenario_1_complete_thought');
    expect(sc1).toBeDefined();
    expect(sc1?.winner).toBe('canonical');
    // Canonical ends at ~13.2s-13.4s without cutting into Tomorrow's sentence
    expect(sc1?.canonical.endSec).toBeGreaterThanOrEqual(13.2);
    expect(sc1?.canonical.endSec).toBeLessThan(14.0);
    expect(sc1?.canonical.cutsMidSentence).toBe(false);

    // Legacy clamped to 15.1s, cutting directly mid-sentence into "Tomorrow we are planning..."
    expect(sc1?.legacy.endSec).toBe(15.1);
    expect(sc1?.legacy.cutsMidSentence).toBe(true);
  });

  it('Gate 5: Scenario 2 (Preamble Stripping) removes throat-clearing "So basically," to hook on thesis', () => {
    const sc2 = report.evaluations.find(e => e.scenarioId === 'scenario_2_preamble_hook');
    expect(sc2).toBeDefined();
    // Canonical starts on core thesis clause at ~0.95s-1.1s (stripping "So basically,")
    expect(sc2?.canonical.startSec).toBeGreaterThanOrEqual(0.95);
    expect(sc2?.canonical.cutsMidWord).toBe(false);
  });

  it('Gate 6: Clean Acoustic Landing Rate is significantly higher in Canonical BoundaryPlanner', () => {
    console.log(`[Benchmark]: Clean Silence Landing -> Legacy: ${report.metrics.legacyCleanSilenceRate}%, Canonical: ${report.metrics.canonicalCleanSilenceRate}%`);
    expect(report.metrics.canonicalCleanSilenceRate).toBeGreaterThanOrEqual(report.metrics.legacyCleanSilenceRate);
  });
});
