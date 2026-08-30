import { Logger } from '@excerpt/shared';
import { VideoJobStatus } from '@excerpt/clipping-core';

export class DeadLetterAlerting {
  constructor(private logger: Logger) {}

  /**
   * Evaluates a job's retry count. If exhausted, moves it to DLQ and alerts.
   * Returns true if the job was dead-lettered, false if it can still retry.
   */
  async handleRetryExhaustion(
    jobId: string, 
    currentRetries: number, 
    maxRetries: number,
    updateStatusInDb: (id: string, status: VideoJobStatus) => Promise<void>
  ): Promise<boolean> {
    
    if (currentRetries >= maxRetries) {
      this.logger.error(`[DLQ] Job ${jobId} exhausted all ${maxRetries} retries. Moving to dead_letter.`);
      
      // 1. Mutate Status
      await updateStatusInDb(jobId, 'dead_letter');

      // 2. Trigger Alert (Mock Webhook / PagerDuty)
      await this.fireAlertWebhook(jobId, 'Retry Exhaustion');

      return true;
    }

    return false;
  }

  private async fireAlertWebhook(jobId: string, reason: string): Promise<void> {
    this.logger.warn(`[ALERT] Fired PagerDuty/Slack webhook for job ${jobId}. Reason: ${reason}`);
    // Mock network request
  }
}
