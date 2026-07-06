import fs from 'fs';

export interface SubtitleWord {
  word: string;
  start: number;
  end: number;
}

export interface SubtitleConfig {
  primaryColor?: string;
  highlightColor?: string;
  fontName?: string;
  fontSize?: number;
  maxCharsPerLine?: number;
  safeAreaCenterY?: number;
}

const DEFAULT_CONFIG: SubtitleConfig = {
  primaryColor: '&H00FFFFFF',
  highlightColor: '&H0000D7FF',
  fontName: 'Montserrat-Black',
  fontSize: 24,
  maxCharsPerLine: 20,
  safeAreaCenterY: 150
};

// ---------------------------------------------------------
// Pipeline Data Structures
// ---------------------------------------------------------

export interface TimedWord extends SubtitleWord {
  duration: number;
  pauseAfter: number;
}

export interface LayoutLine {
  words: TimedWord[];
  start: number;
  end: number;
  text: string;
}

export interface StyledLine extends LayoutLine {
  assLines: string[]; // Intermediate ASS dialog representation (before full generation)
}

// ---------------------------------------------------------
// Engine Modules
// ---------------------------------------------------------

export class TimingEngine {
  public process(words: SubtitleWord[]): TimedWord[] {
    return words.map((w, i) => {
      const nextWord = words[i + 1];
      const pauseAfter = nextWord ? nextWord.start - w.end : 0;
      return {
        ...w,
        duration: w.end - w.start,
        pauseAfter: Math.max(0, pauseAfter)
      };
    });
  }
}

export class LayoutEngine {
  public process(timedWords: TimedWord[], maxChars: number): LayoutLine[] {
    const lines: LayoutLine[] = [];
    let currentLineWords: TimedWord[] = [];
    let currentChars = 0;

    for (const word of timedWords) {
      const isLongPause = word.pauseAfter > 0.5;
      const exceedsLength = currentChars + word.word.length > maxChars;

      if ((exceedsLength && currentLineWords.length > 0) || (currentLineWords.length > 0 && currentLineWords[currentLineWords.length - 1].pauseAfter > 0.5)) {
        lines.push(this.createLayoutLine(currentLineWords));
        currentLineWords = [];
        currentChars = 0;
      }

      currentLineWords.push(word);
      currentChars += word.word.length + 1; // +1 for space
    }

    if (currentLineWords.length > 0) {
      lines.push(this.createLayoutLine(currentLineWords));
    }

    return lines;
  }

  private createLayoutLine(words: TimedWord[]): LayoutLine {
    return {
      words,
      start: words[0].start,
      end: words[words.length - 1].end,
      text: words.map(w => w.word).join(' ')
    };
  }
}

export class StylingEngine {
  public process(layoutLines: LayoutLine[], config: SubtitleConfig): StyledLine[] {
    return layoutLines.map(line => {
      const assLines: string[] = [];
      
      for (let i = 0; i < line.words.length; i++) {
        const activeWord = line.words[i];
        
        let styledText = '';
        for (let j = 0; j < line.words.length; j++) {
          const w = line.words[j];
          const isEmphasized = w.word.length > 5;
          
          if (j === i) {
            styledText += `{\\c${config.highlightColor}}{\\b1}${w.word}{\\b0}{\\c${config.primaryColor}} `;
          } else {
            styledText += isEmphasized ? `{\\b1}${w.word}{\\b0} ` : `${w.word} `;
          }
        }
        
        assLines.push(
          `Dialogue: 0,${this.formatTime(activeWord.start)},${this.formatTime(activeWord.end)},Default,,0,0,0,,${styledText.trim()}`
        );
      }
      
      return {
        ...line,
        assLines
      };
    });
  }

  private formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }
}

export class ASSGenerator {
  public generate(styledLines: StyledLine[], config: SubtitleConfig): string {
    let content = this.getASSHeader(config);
    
    for (const line of styledLines) {
      for (const ass of line.assLines) {
        content += ass + '\n';
      }
    }
    
    return content;
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

// ---------------------------------------------------------
// Main Engine Orchestrator
// ---------------------------------------------------------

export class SubtitleEngine {
  private timingEngine = new TimingEngine();
  private layoutEngine = new LayoutEngine();
  private stylingEngine = new StylingEngine();
  private assGenerator = new ASSGenerator();

  public async generateASS(
    words: SubtitleWord[], 
    outputPath: string,
    config: Partial<SubtitleConfig> = {}
  ): Promise<string> {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    const timed = this.timingEngine.process(words);
    const layout = this.layoutEngine.process(timed, finalConfig.maxCharsPerLine!);
    const styled = this.stylingEngine.process(layout, finalConfig);
    const assContent = this.assGenerator.generate(styled, finalConfig);
    
    fs.writeFileSync(outputPath, assContent, 'utf-8');
    return outputPath;
  }
}
