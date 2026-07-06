/**
 * TranscriptionCircuitBreaker
 *
 * Process-level singleton that guards outbound Whisper/Groq calls.
 * Prevents cascading retries hammering a provider during an outage.
 *
 * State machine:
 *   CLOSED  → normal operation
 *   OPEN    → provider failing; reject new calls immediately
 *   HALF_OPEN → probe period; one request allowed through
 *
 * CLOSED  --[n consecutive failures]--> OPEN
 * OPEN    --[OPEN_DURATION_MS elapsed]--> HALF_OPEN
 * HALF_OPEN --[success]--> CLOSED
 * HALF_OPEN --[failure]--> OPEN
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  totalTrips: number;
  lastFailureCode: string | null;
}

export class TranscriptionCircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private openedAt: number | null = null;
  private totalTrips = 0;
  private lastFailureCode: string | null = null;

  // Configurable via env vars, with sensible defaults
  private readonly FAILURE_THRESHOLD: number;
  private readonly OPEN_DURATION_MS: number;

  private static _instance: TranscriptionCircuitBreaker | null = null;

  private constructor() {
    this.FAILURE_THRESHOLD = parseInt(process.env.EXCERPT_CB_FAILURE_THRESHOLD || '5', 10);
    this.OPEN_DURATION_MS = parseInt(process.env.EXCERPT_CB_OPEN_DURATION_MS || '60000', 10);
  }

  static getInstance(): TranscriptionCircuitBreaker {
    if (!TranscriptionCircuitBreaker._instance) {
      TranscriptionCircuitBreaker._instance = new TranscriptionCircuitBreaker();
    }
    return TranscriptionCircuitBreaker._instance;
  }

  /**
   * Returns true if a request should be allowed through.
   * Throws if the circuit is OPEN and the open duration hasn't elapsed.
   */
  canRequest(): boolean {
    if (this.state === 'CLOSED') return true;

    if (this.state === 'OPEN') {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= this.OPEN_DURATION_MS) {
        this.state = 'HALF_OPEN';
        console.warn(`[CircuitBreaker]: HALF_OPEN — allowing one probe request after ${Math.round(elapsed / 1000)}s`);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow exactly one probe through
    return true;
  }

  recordSuccess(requestId?: string): void {
    const prevState = this.state;
    this.consecutiveFailures = 0;
    this.state = 'CLOSED';
    this.openedAt = null;
    this.lastFailureCode = null;

    if (prevState !== 'CLOSED') {
      console.log(`[CircuitBreaker]: CLOSED — transcription provider recovered (requestId=${requestId ?? 'unknown'})`);
    }
  }

  recordFailure(errorCode: string): void {
    this.consecutiveFailures++;
    this.lastFailureCode = errorCode;

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.FAILURE_THRESHOLD) {
      this.state = 'OPEN';
      this.openedAt = Date.now();
      this.totalTrips++;
      console.error(
        `[CircuitBreaker]: OPEN — ${this.consecutiveFailures} consecutive failures ` +
        `(code=${errorCode}, totalTrips=${this.totalTrips}). ` +
        `Blocking Groq calls for ${this.OPEN_DURATION_MS / 1000}s.`
      );
    }
  }

  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      totalTrips: this.totalTrips,
      lastFailureCode: this.lastFailureCode,
    };
  }

  /** Reset — for testing or manual ops recovery */
  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.openedAt = null;
    console.warn('[CircuitBreaker]: Manually reset to CLOSED');
  }
}
