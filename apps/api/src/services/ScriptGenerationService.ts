import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import dotenv from 'dotenv';
dotenv.config();

export class ScriptGenerationService {
  private static instance: ScriptGenerationService;
  private geminiKeys: string[] = [];
  private currentGeminiKeyIndex: number = 0;
  private groqClient: Groq | null = null;

  private constructor() {
    const geminiKeyStr = process.env.GOOGLE_AI_API_KEY || '';
    if (geminiKeyStr) {
      this.geminiKeys = geminiKeyStr.split(',').map(k => k.trim()).filter(Boolean);
    }
    
    if (process.env.GROQ_API_KEY) {
      this.groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
  }

  static getInstance(): ScriptGenerationService {
    if (!ScriptGenerationService.instance) {
      ScriptGenerationService.instance = new ScriptGenerationService();
    }
    return ScriptGenerationService.instance;
  }

  private getStyleInstructions(style: string, customInstruction?: string): string {
    switch (style) {
      case 'football_commentary':
        return `Write high-energy, play-by-play football commentary. Emphasize excitement, action, crowd roar, and tactical brilliance of the moment. Use dramatic descriptions (e.g., "What an unbelievable sequence of play...").`;
      case 'viral_shorts':
        return `Write an attention-grabbing short-form hook suitable for TikTok, Reels, or YouTube Shorts. Use intense curiosity loops (e.g., "Wait until you see what happens next...").`;
      case 'tactical_analysis':
        return `Write analytical, detail-oriented breakdown. Focus on spatial awareness, defender errors, positional tactics, and strategy (e.g., "Watch the positioning of the defender...").`;
      case 'documentary':
        return `Write deep, narrative, cinematic storytelling. Emphasize historical context, gravity of the moment, and emotional depth (e.g., "This moment would completely change the match...").`;
      case 'youtube_narrator':
        return `Write engaging narrator style, detailing why this moment is fascinating and why it stunned everyone (e.g., "Here's why this goal stunned everyone...").`;
      case 'custom_prompt':
      default:
        return `Follow this custom instructions/persona strictly: "${customInstruction || 'Act like a standard sports commentator'}".`;
    }
  }

  async generateScript(
    style: string,
    language: string,
    contextText?: string,
    customInstruction?: string
  ): Promise<string> {
    if (this.geminiKeys.length === 0 && !this.groqClient) {
      throw new Error('No AI providers configured. Either GOOGLE_AI_API_KEY or GROQ_API_KEY is required.');
    }

    const styleGuide = this.getStyleInstructions(style, customInstruction);
    const systemPrompt = `You are a professional script writer and localization expert.
Your job is to generate a voiceover script in the language: "${language}".
Format: Return ONLY the final voiceover text to be spoken. Do NOT include any stage directions, speaker labels, narration cues, sound effect placeholders, quotes, or markdown tags. Return only the plain speakable script.
Validation rules:
- Length must be between 20 and 5000 characters.
- Must be written in fluent, native "${language}".
- Follow this style guide: ${styleGuide}`;

    const userPrompt = contextText 
      ? `Here is the context of the clip (transcript or metadata):\n"${contextText}"\n\nWrite a compelling script based on this context.`
      : `Write a compelling script based on the style and language specified.`;

    let lastError: any = null;

    // 1. Try Gemini Keys
    for (let i = 0; i < this.geminiKeys.length; i++) {
      try {
        const key = this.geminiKeys[this.currentGeminiKeyIndex];
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        const response = await result.response;
        const script = response.text().trim();
        
        if (script.length < 20) throw new Error(`Generated script is too short (${script.length} characters).`);
        if (script.length > 5000) throw new Error(`Generated script is too long (${script.length} characters).`);

        return script;
      } catch (error: any) {
        lastError = error;
        const msg = error.message?.toLowerCase() || '';
        if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
          console.warn(`[ScriptGenerationService]: Gemini key ${this.currentGeminiKeyIndex + 1} quota exhausted, rotating...`);
          this.currentGeminiKeyIndex = (this.currentGeminiKeyIndex + 1) % this.geminiKeys.length;
        } else {
          console.warn(`[ScriptGenerationService]: Gemini generation failed:`, error.message);
          break; // Don't rotate for non-quota errors
        }
      }
    }

    // 2. Try Groq Fallback
    if (this.groqClient) {
      try {
        console.log('[ScriptGenerationService]: Falling back to Groq Llama-3.3-70b-versatile');
        const completion = await this.groqClient.chat.completions.create({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          model: 'llama-3.3-70b-versatile',
          temperature: 0.7,
        });

        const script = completion.choices[0]?.message?.content?.trim() || '';
        
        if (script.length < 20) throw new Error(`Generated script is too short (${script.length} characters).`);
        if (script.length > 5000) throw new Error(`Generated script is too long (${script.length} characters).`);

        return script;
      } catch (error: any) {
        console.error('[ScriptGenerationService]: Groq fallback failed:', error.message);
        lastError = error;
      }
    }

    throw new Error(`Script generation failed across all providers. Last error: ${lastError?.message}`);
  }
}
