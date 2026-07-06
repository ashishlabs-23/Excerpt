import fs from 'fs';
import path from 'path';

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleConfig {
  primaryColor?: string;     // e.g. &H0000FFFF (AABBGGRR)
  highlightColor?: string;   // e.g. &H0000D7FF (Gold)
  fontName?: string;         // e.g. "Montserrat-Black"
  fontSize?: number;         // e.g. 24
  maxCharsPerLine?: number;  // e.g. 20
  safeAreaCenterY?: number;  // e.g. 288 (out of 1920x1080 typical portait size)
}

const DEFAULT_CONFIG: SubtitleConfig = {
  primaryColor: '&H00FFFFFF', // White
  highlightColor: '&H0000D7FF', // Gold/Yellow
  fontName: 'Montserrat-Black',
  fontSize: 24,
  maxCharsPerLine: 20,
  safeAreaCenterY: 150 // Placed roughly at the center-third
};

export class SubtitleEngine {
  
  /**
   * Generates a premium .ass subtitle file with karaoke-style word highlighting,
   * safe-area placement, and balanced line breaking.
   */
  public async generateASS(
    words: SubtitleWord[], 
    outputPath: string,
    config: Partial<SubtitleConfig> = {}
  ): Promise<string> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    let assContent = this.getASSHeader(finalConfig);
    
    // 1. Group words into balanced lines
    const lines = this.groupWordsIntoLines(words, finalConfig.maxCharsPerLine!);
    
    // 2. Generate ASS dialogue lines with karaoke override tags
    for (const line of lines) {
      if (line.words.length === 0) continue;
      
      const lineStart = this.formatTime(line.words[0].start);
      const lineEnd = this.formatTime(line.words[line.words.length - 1].end);
      
      // We render the line multiple times (if needed) or use standard karaoke tags {\k10}
      // For a premium look without complex Lua scripts, we will use ASS karaoke tags {\kX} 
      // or \c&H...& color overrides per word.
      
      // Let's use explicit color overrides for active word highlighting because it allows 
      // smooth "pop" effects if we wanted to add \t tags later.
      // For simplicity, we just color the "active" word. This means we duplicate the Dialogue line 
      // for each active word, changing the color of that specific word.
      
      for (let i = 0; i < line.words.length; i++) {
        const activeWord = line.words[i];
        const activeStart = this.formatTime(activeWord.start);
        const activeEnd = this.formatTime(activeWord.end);
        
        let textLine = '';
        for (let j = 0; j < line.words.length; j++) {
          const w = line.words[j];
          const isEmphasized = w.word.length > 5; // Simple heuristic for keyword emphasis
          
          if (j === i) {
            // Active word
            textLine += `{\\c${finalConfig.highlightColor}}{\\b1}${w.word}{\\b0}{\\c${finalConfig.primaryColor}} `;
          } else {
            // Inactive word
            textLine += isEmphasized ? `{\\b1}${w.word}{\\b0} ` : `${w.word} `;
          }
        }
        
        // Add the dialogue line for the duration this word is spoken
        assContent += `Dialogue: 0,${activeStart},${activeEnd},Default,,0,0,0,,${textLine.trim()}\n`;
      }
    }
    
    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }
  
  private groupWordsIntoLines(words: SubtitleWord[], maxChars: number) {
    const lines: { words: SubtitleWord[] }[] = [];
    let currentLine: SubtitleWord[] = [];
    let currentChars = 0;
    
    for (const word of words) {
      // If adding this word exceeds max chars, or there is a long pause (>0.5s), break line
      const pauseDuration = currentLine.length > 0 
        ? word.start - currentLine[currentLine.length - 1].end 
        : 0;
        
      if ((currentChars + word.word.length > maxChars && currentLine.length > 0) || pauseDuration > 0.5) {
        lines.push({ words: currentLine });
        currentLine = [];
        currentChars = 0;
      }
      
      currentLine.push(word);
      currentChars += word.word.length + 1; // +1 for space
    }
    
    if (currentLine.length > 0) {
      lines.push({ words: currentLine });
    }
    
    return lines;
  }
  
  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }
  
  private getASSHeader(config: SubtitleConfig): string {
    return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${config.fontName},${config.fontSize},${config.primaryColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,5,30,30,${config.safeAreaCenterY},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  }
}
