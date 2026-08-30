import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  providerName: string;
  failureThreshold: number; // e.g. 5 failures
  cooldownMs: number; // e.g. 30000ms
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(private config: CircuitBreakerConfig, private logger: Logger) {}

  /**
   * Evaluates the circuit state before allowing a call.
   */
  async checkCircuit(): Promise<void> {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.cooldownMs) {
        // Cooldown passed, test recovery
        this.logger.info(`[CircuitBreaker] ${this.config.providerName} cooldown passed. Transitioning to HALF_OPEN.`);
        this.state = 'HALF_OPEN';
      } else {
        // Still open
        throw new PipelineError(
          PipelineErrorCode.CircuitOpen, 
          `Circuit breaker for ${this.config.providerName} is OPEN. Call rejected.`
        );
      }
    }
  }

  /**
   * Reports a successful call, resetting the circuit.
   */
  reportSuccess(): void {
    if (this.state === 'HALF_OPEN' || this.failureCount > 0) {
      this.logger.info(`[CircuitBreaker] ${this.config.providerName} recovered. Transitioning to CLOSED.`);
      this.state = 'CLOSED';
      this.failureCount = 0;
    }
  }

  /**
   * Reports a failure, incrementing the threshold.
   */
  reportFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Failed during testing recovery, instantly re-open
      this.logger.error(`[CircuitBreaker] ${this.config.providerName} failed while HALF_OPEN. Re-opening.`);
      this.state = 'OPEN';
    } else if (this.state === 'CLOSED' && this.failureCount >= this.config.failureThreshold) {
      // Breached threshold
      this.logger.error(`[CircuitBreaker] ${this.config.providerName} failure threshold breached (${this.failureCount}). Transitioning to OPEN.`);
      this.state = 'OPEN';
    }
  }
}
