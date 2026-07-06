import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { parseJsonWithRepair } from "../ollamaService";
import fs from 'fs';
import path from 'path';
import { TranscriptionResult } from "../transcriptionService";

export interface ClipCandidate {
  start_time: number;
  end_time: number;
  hook: string;
  payoff: string;
  emotion: string;
  curiosity_gap: string;
  visual_importance: number;
  confidence: number;
  summary: string;
}

export class CandidateGenerationEngine {
  private groq: Groq;

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
    
    // Pass the transcript with word or segment level timestamps to the LLM.
    // For cost/context window reasons, we might chunk the transcript if it's too long,
    // but for now we assume it fits in an 8k/32k window.
    
    const systemPromptPath = path.join(process.cwd(), 'prompts', 'candidate_generation', 'v1.md');
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf-8');

    const userPrompt = `Transcript:\n<transcript>\n${transcription.text}\n</transcript>\n\nReturn 20-30 candidates in JSON.`;

    const response = await this.groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 4000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" } // Using standard completion, will parse later
    });

    const content = response.choices[0]?.message?.content || "[]";
    const parsed = parseJsonWithRepair<any>(content, "array");
    
    // In case the model wrapped it in an object like { "candidates": [...] }
    let rawArray = [];
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && Array.isArray(parsed.candidates)) {
      rawArray = parsed.candidates;
    } else {
      throw new Error("Failed to parse Stage A candidates from LLM.");
    }

    // Filter out wildly out-of-bounds candidates
    const validCandidates = rawArray.filter(c => 
      typeof c.start_time === 'number' && 
      typeof c.end_time === 'number' &&
      c.end_time - c.start_time >= 10 &&
      c.end_time - c.start_time <= 90
    );

    const diverseCandidates = this.clusterCandidates(validCandidates as ClipCandidate[]);

    console.log(`[CandidateGenerationEngine] Stage A complete. Generated ${diverseCandidates.length} diverse candidates from ${validCandidates.length} raw candidates.`);
    return diverseCandidates;
  }

  private clusterCandidates(candidates: ClipCandidate[]): ClipCandidate[] {
    const clusters: ClipCandidate[][] = [];

    for (const candidate of candidates) {
      let addedToCluster = false;
      
      for (const cluster of clusters) {
        const representative = cluster[0];
        
        // 1. Temporal Overlap
        const startMax = Math.max(candidate.start_time, representative.start_time);
        const endMin = Math.min(candidate.end_time, representative.end_time);
        const overlapDuration = Math.max(0, endMin - startMax);
        const candidateDuration = candidate.end_time - candidate.start_time;
        const temporalOverlapRatio = overlapDuration / candidateDuration;

        // 2. Semantic Similarity (heuristic: similar emotion or curiosity gap)
        const semanticMatch = candidate.emotion === representative.emotion || 
                              this.calculateTextSimilarity(candidate.summary, representative.summary) > 0.6;
                              
        // 3. Shared Events / Actors (if temporal overlap is high, it's the same event)
        if (temporalOverlapRatio > 0.4 || (temporalOverlapRatio > 0.2 && semanticMatch)) {
          cluster.push(candidate);
          addedToCluster = true;
          break;
        }
      }

      if (!addedToCluster) {
        clusters.push([candidate]);
      }
    }

    // From each cluster, pick the one with the highest confidence
    const diverseCandidates = clusters.map(cluster => {
      return cluster.reduce((best, current) => 
        (current.confidence > best.confidence) ? current : best
      );
    });

    return diverseCandidates;
  }
  
  private calculateTextSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    const wordsA = new Set(a.toLowerCase().split(/\W+/));
    const wordsB = new Set(b.toLowerCase().split(/\W+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
