import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import { GraphValidator } from '../graphs/GraphValidator';

export type LLMGenerator<T> = (prompt: string) => Promise<T>;

export class LLMOrchestrator {
  constructor(private logger: Logger) {}

  /**
   * Orchestrates LLM generation with strict schema validation and a retry-then-fail loop.
   */
  async generateGraphWithRetry<T extends { nodes: any[] }>(
    generator: LLMGenerator<T>,
    initialPrompt: string,
    mediaDurationMs: number,
    graphName: string,
    allowOverlap: boolean = false
  ): Promise<T> {
    try {
      return await this.attemptGeneration(generator, initialPrompt, mediaDurationMs, allowOverlap);
    } catch (err: any) {
      this.logger.warn(`${graphName} initial generation failed. Retrying... Reason: ${err.message}`);
      
      const correctivePrompt = `${initialPrompt}\n\nPREVIOUS ERROR:\nYour previous JSON failed validation: ${err.message}. Please strictly follow the schema constraints.`;
      
      try {
        return await this.attemptGeneration(generator, correctivePrompt, mediaDurationMs, allowOverlap);
      } catch (retryErr: any) {
        this.logger.error(`${graphName} retry failed. Aborting.`);
        throw new PipelineError(
          PipelineErrorCode.GraphConstructionFailed,
          `Failed to generate valid ${graphName} after retry: ${retryErr.message}`
        );
      }
    }
  }

  private async attemptGeneration<T extends { nodes: any[] }>(
    generator: LLMGenerator<T>,
    prompt: string,
    mediaDurationMs: number,
    allowOverlap: boolean
  ): Promise<T> {
    // In a real system, this generator calls OpenAI/Anthropic/Gemini
    const output = await generator(prompt);

    if (!output || !Array.isArray(output.nodes)) {
      throw new Error('Malformed output: missing "nodes" array');
    }

    const validationErrors = GraphValidator.validate(output.nodes, mediaDurationMs, allowOverlap);
    
    if (validationErrors.length > 0) {
      throw new Error(`Validation failed:\n- ${validationErrors.join('\n- ')}`);
    }

    return output;
  }
}
