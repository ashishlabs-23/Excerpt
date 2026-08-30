import { AuditableEvaluation } from '@excerpt/clipping-core';
import fs from 'fs/promises';
import path from 'path';

export class EvaluationStore {
  constructor(private storageDirectory: string) {}

  async init() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
  }

  private getFilePath(correlationId: string, candidateId: string): string {
    return path.join(this.storageDirectory, `${correlationId}_${candidateId}.json`);
  }

  /**
   * Persists the full debate trail and judge decision for auditable playback.
   */
  async save(evaluation: AuditableEvaluation): Promise<void> {
    const filePath = this.getFilePath(evaluation.correlationId, evaluation.candidateId);
    await fs.writeFile(filePath, JSON.stringify(evaluation, null, 2), 'utf-8');
  }

  /**
   * Fetches a historical evaluation.
   */
  async fetch(correlationId: string, candidateId: string): Promise<AuditableEvaluation | null> {
    const filePath = this.getFilePath(correlationId, candidateId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
}
