export enum CaptionStyle {
  HORMOZI = 'HORMOZI',
  KINETIC = 'KINETIC',
  MINIMAL = 'MINIMAL',
  CLEAN = 'CLEAN',
  RAW = 'RAW'
}

export interface SafeZone {
  topPercent: number;
  bottomPercent: number;
  leftPercent: number;
  rightPercent: number;
}

export interface CaptionStyleConfig {
  name: CaptionStyle;
  supportedScripts: ('LATIN' | 'RTL' | 'CJK')[];
  maxWordsPerSecond: number;
  maxLineLength: number;
  safeZone: SafeZone;
  features: {
    activeWordHighlighting: boolean;
    speakerColors: boolean;
    emphasis: boolean;
    emoji: boolean;
  };
}

export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
  isEmphasis?: boolean;
  color?: string;
  emoji?: string;
}

export interface CaptionCard {
  words: CaptionWord[];
  startMs: number;
  endMs: number;
  x: number;
  y: number;
  style: CaptionStyle;
}

export interface CaptionPlan {
  schemaVersion: string;
  cards: CaptionCard[];
}
