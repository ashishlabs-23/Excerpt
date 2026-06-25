import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { VideoProcessor } from "./videoProcessor";

const processor = new VideoProcessor();

export interface WordInfo {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptionResult {
  text: string;
  segments: any[];
  words?: WordInfo[];
}

export class TranscriptionService {
  private _groq: Groq | null = null;

  private get groq(): Groq {
    if (!this._groq) {
      this._groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
    }
    return this._groq;
  }

  /**
   * Transcribes a video file. Now uses 'Neural Chunking' for massive videos.
   */
  async transcribe(videoPath: string): Promise<TranscriptionResult> {
    const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.mp3');
    console.log(`[TranscriptionService]: 🎙️ Extracting 'Neural HD' (64kbps) audio...`);
    await processor.extractAudio(videoPath, audioPath);

    const audioSize = fs.statSync(audioPath).size;
    const sizeMB = audioSize / 1024 / 1024;
    console.log(`[TranscriptionService]: Audio weight: ${sizeMB.toFixed(2)} MB`);

    const MAX_SIZE_MB = 20; // Safe margin for 25MB limit
    if (sizeMB < MAX_SIZE_MB) {
      return this._transcribeChunk(audioPath);
    }

    console.log(`[TranscriptionService]: 🧩 Neural Chunking Active -> Splitting ${sizeMB.toFixed(1)}MB audio...`);
    const chunks = await this._splitAudio(audioPath);
    console.log(`[TranscriptionService]: 🧩 Found ${chunks.length} chunks. Synchronizing...`);

    let fullText = '';
    let allSegments: any[] = [];
    let allWords: any[] = [];
    let timeOffset = 0;

    for (let i = 0; i < chunks.length; i++) {
        console.log(`[TranscriptionService]: 📡 Neural Decode -> Chunk ${i+1}/${chunks.length}...`);
        const result = await this._transcribeChunk(chunks[i]);
        
        const chunkStart = i * 600;
        const chunkEnd = chunkStart + 600;

        // Only include segments and words that start within our primary 600s window (except for the last chunk)
        // This effectively deduplicates using the 'overlap' buffer
        const filteredSegments = result.segments.filter(seg => {
            const absoluteStart = seg.start + chunkStart;
            return i === chunks.length - 1 || absoluteStart < chunkEnd;
        });

        const offsetSegments = filteredSegments.map(seg => ({
            ...seg,
            start: seg.start + chunkStart,
            end: seg.end + chunkStart
        }));

        const filteredWords = (result.words || []).filter(w => {
            const absoluteStart = w.start + chunkStart;
            return i === chunks.length - 1 || absoluteStart < chunkEnd;
        });

        const offsetWords = filteredWords.map(w => ({
            ...w,
            start: w.start + chunkStart,
            end: w.end + chunkStart
        }));

        allSegments.push(...offsetSegments);
        allWords.push(...offsetWords);
        
        // Build full text from deduped segments
        const chunkText = filteredSegments.map(seg => seg.text).join(' ');
        fullText += (fullText ? ' ' : '') + chunkText;
        
        // Cleanup chunk
        try { fs.unlinkSync(chunks[i]); } catch {}
    }

    // Cleanup main audio
    try { fs.unlinkSync(audioPath); } catch {}

    return { text: fullText, segments: allSegments, words: allWords };
  }

  private async _splitAudio(inputPath: string): Promise<string[]> {
    const tempDir = path.dirname(inputPath);
    const chunkDuration = 600; // 10 minutes
    const overlap = 10; // 10 seconds overlap for safety
    
    // Get total duration first
    const duration = await processor.getVideoDuration(inputPath);
    const chunks: string[] = [];
    
    let ffmpeg = 'ffmpeg';
    const envPath = process.env.FFMPEG_PATH?.trim();
    if (envPath && fs.existsSync(envPath)) {
      ffmpeg = envPath;
    } else {
      const localPath = path.join(__dirname, '..', '..', 'bin', 'ffmpeg.exe');
      if (fs.existsSync(localPath)) ffmpeg = localPath;
    }

    const { execFile } = require('child_process');
    
    for (let start = 0; start < duration; start += chunkDuration) {
        const chunkPath = path.join(tempDir, `chunk_${Math.floor(start/chunkDuration).toString().padStart(3, '0')}.mp3`);
        const actualDuration = Math.min(chunkDuration + overlap, duration - start);
        
        await new Promise<void>((resolve, reject) => {
            const args = ['-ss', start.toString(), '-i', inputPath, '-t', actualDuration.toString(), '-c', 'copy', '-y', chunkPath];
            execFile(ffmpeg, args, (error: any) => {
                if (error) reject(error);
                else resolve();
            });
        });
        chunks.push(chunkPath);
    }
    
    return chunks;
  }

  private async _transcribeChunk(audioPath: string): Promise<TranscriptionResult> {
    const fileBuffer = fs.readFileSync(audioPath);
    const fileBlob = new Blob([fileBuffer], { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append("file", fileBlob, "audio.mp3");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "word");
    formData.append("timestamp_granularities[]", "segment");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}` },
      body: formData as any
    });

    if (!response.ok) {
      throw new Error(`Groq HTTP Error: ${response.status} ${await response.text()}`);
    }

    const jsonResponse = await response.json() as any;
    const segments = jsonResponse.segments || [];
    const words = jsonResponse.words || [];
    const text = segments.map((seg: any) => `[${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s]: ${seg.text.trim()}`).join('\n');

    return { text, segments, words };
  }

}
