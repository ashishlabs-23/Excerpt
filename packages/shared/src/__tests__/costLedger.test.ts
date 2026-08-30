import { createCostLedger } from '../cost/costLedger';
import { PipelineErrorCode } from '@excerpt/clipping-core';

describe('Cost Ledger', () => {
  it('T5: budget ceiling halts further paid calls', () => {
    const ledger = createCostLedger('job-123', 5.00);
    
    expect(ledger.totalCostUsd).toBe(0);

    ledger.append({
      stage: 'transcription',
      provider: 'openai',
      unit: 'seconds',
      quantity: 3600,
      estimatedCostUsd: 2.50
    });

    expect(ledger.totalCostUsd).toBe(2.50);

    ledger.append({
      stage: 'perception',
      provider: 'anthropic',
      unit: 'requests',
      quantity: 1,
      estimatedCostUsd: 2.50
    });

    expect(ledger.totalCostUsd).toBe(5.00);

    // This one should throw
    expect(() => {
      ledger.append({
        stage: 'render',
        provider: 'aws',
        unit: 'seconds',
        quantity: 300,
        estimatedCostUsd: 0.10
      });
    }).toThrowError(expect.objectContaining({ code: PipelineErrorCode.BudgetExceeded }));
    
    // Total cost shouldn't have changed
    expect(ledger.totalCostUsd).toBe(5.00);
    expect(ledger.entries.length).toBe(2);
  });
});
