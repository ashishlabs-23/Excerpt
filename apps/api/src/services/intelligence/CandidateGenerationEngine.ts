import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { parseJsonWithRepair } from "../ollamaService";
import fs from 'fs';
import path from 'path';
import { TranscriptionResult } from "../transcriptionService";
import { CandidateClusterer, RawClipCandidate as ClipCandidate, StageExecutor } from "@excerpt/clipping-core";

export { ClipCandidate };

export class CandidateGenerationEngine {
  private groq: Groq;
  private clusterer = new CandidateClusterer();

  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }

  /**
   * Stage A: Generate 20-30 high-potential candidate windows from the transcript.
   * Leverages word-level timestamps if available, but falls back to segment timings.
   */
  public async generateCandidates(
    transcription: TranscriptionResult, 
    videoUrl: string
  ): Promise<ClipCandidate[]> {
    console.log('[CandidateGenerationEngine] Stage A: Generating raw candidate windows...');

    return StageExecutor.run(transcription, {
      stage: 'candidate_generation',
      component: 'CandidateGenerationEngine',
      provider: 'Groq',
      timeoutMs: 60000,
      timeoutType: 'api_timeout',
      maxRetries: 2,
      retryDelayMs: 1000,
      validateInput: (input) => Boolean(input && input.text && input.text.trim().length > 0),
      execute: async (input) => {
        const systemPromptPath = path.join(process.cwd(), 'prompts', 'candidate_generation', 'v1.md');
        let systemPrompt = "Extract 20-30 high potential clip candidate windows from the transcript.";
        if (fs.existsSync(systemPromptPath)) {
          systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');
        }

        const userPrompt = `Transcript:\n<transcript>\n${input.text}\n</transcript>\n\nReturn 20-30 candidates in JSON.`;

        const response = await this.groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          temperature: 0.2,
          max_tokens: 4000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" }
        });

        const content = response.choices[0]?.message?.content || "[]";
        const parsed = parseJsonWithRepair<any>(content, "array");

        let rawArray = [];
        if (Array.isArray(parsed)) {
          rawArray = parsed;
        } else if (parsed && Array.isArray(parsed.candidates)) {
          rawArray = parsed.candidates;
        } else {
          throw new Error("Failed to parse Stage A candidates from LLM response.");
        }

        const validCandidates = rawArray.filter((c: any) => 
          typeof c.start_time === 'number' && 
          typeof c.end_time === 'number' &&
          c.end_time - c.start_time >= 10 &&
          c.end_time - c.start_time <= 90
        );

        const diverseCandidates = this.clusterer.clusterCandidates(validCandidates as ClipCandidate[]);
        console.log(`[CandidateGenerationEngine] Stage A complete. Generated ${diverseCandidates.length} diverse candidates.`);
        return diverseCandidates;
      },
      validateOutput: (candidates) => Array.isArray(candidates) && candidates.length > 0,
    });
  }
}

