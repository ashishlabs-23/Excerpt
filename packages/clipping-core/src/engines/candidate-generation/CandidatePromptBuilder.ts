import { TranscriptionResult } from '../../types/pipeline';

export class CandidatePromptBuilder {
  /**
   * Builds the system and user prompts for candidate generation.
   * Does NOT make network calls.
   */
  public buildPrompt(
    transcription: TranscriptionResult,
    sentenceUnits?: Array<{ id: string; text: string; startSec?: number; endSec?: number }>
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a professional video editor. Your task is to identify 20-30 high-potential viral clip boundaries from the provided transcript.
Find highly engaging moments:
- Look for strong emotional reactions
- Find clear setups and complete payoffs
- Identify curiosity gaps
- Select complete, coherent thoughts rather than truncating mid-sentence. Choose semantic units that stand alone.

Return the result as JSON in this format:
{
  "candidates": [
    {
      "start_sentence_id": "s_1",
      "end_sentence_id": "s_5",
      "start_time": 10.5,
      "end_time": 45.2,
      "hook": "The first 3 seconds describing the hook",
      "payoff": "The climax/payoff description",
      "emotion": "excited, tense, funny...",
      "curiosity_gap": "Why is this interesting to watch?",
      "visual_importance": 0.8,
      "confidence": 0.9,
      "summary": "Brief summary"
    }
  ]
}`;

    let transcriptContent = transcription.text;
    if (sentenceUnits && sentenceUnits.length > 0) {
      transcriptContent = sentenceUnits
        .map((s) => `[${s.id}] ${s.text}`)
        .join('\n');
    }

    const userPrompt = `Transcript:\n<transcript>\n${transcriptContent}\n</transcript>\n\nReturn 20-30 candidates in JSON.`;
    return { systemPrompt, userPrompt };
  }
}
