import fs from 'fs';
import path from 'path';

export type CaptionPreset = 'hormozi' | 'mrbeast' | 'neon' | 'minimalist' | 'submagic' | 'tiktok' | 'minimal';

export class KineticCaptionGenerator {
    private emojiMap: Record<string, string> = {
        'fire': '🔥',
        'great': '🙌',
        'good': '👍',
        'best': '🏆',
        'game': '🎮',
        'show': '📺',
        'moment': '⏰',
        'viral': '⚡',
        'love': '❤️',
        'cool': '😎',
        'mind': '🧠',
        'money': '💰',
        'work': '💼',
        'life': '🌱',
        'power': '🔋',
        'win': '🎯',
        'secret': '🤫',
        'crazy': '🤯',
        'stop': '🛑',
        'fast': '🚀',
    };

    private getEmojiForWord(word: string): string {
        const clean = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
        return this.emojiMap[clean] || "";
    }

    generateASS(
        words: {start: number; end: number; word: string}[],
        outputPath: string,
        preset: CaptionPreset | string = 'submagic',
        clipDurationSec?: number,
        options?: {
            fontSize?: number;
            position?: 'bottom' | 'middle' | 'top';
            color?: string;
        }
    ) {
        const normalizedPreset = (preset || 'submagic').toLowerCase();
        let highlightColor = '&H009948EC&'; // Submagic Vibrant Pink (BGR for #ec4899)
        let outlineThickness = 4;
        let shadowThickness = 2;
        let fontSize = 52;
        let isItalic = 0;

        if (normalizedPreset === 'submagic') {
            highlightColor = '&H009948EC&'; // Vibrant Pink (#ec4899)
            outlineThickness = 4;
            shadowThickness = 2;
            fontSize = 52;
        } else if (normalizedPreset === 'tiktok') {
            highlightColor = '&H0015CCFA&'; // High-Contrast Yellow (#facc15)
            outlineThickness = 4;
            shadowThickness = 1;
            fontSize = 52;
        } else if (normalizedPreset === 'hormozi') {
            highlightColor = '&H0008B3EA&'; // Alex Hormozi Warm Gold/Yellow (#eab308)
            outlineThickness = 4;
            shadowThickness = 2;
            fontSize = 52;
            isItalic = -1; // Italic pop matching editor
        } else if (normalizedPreset === 'mrbeast') {
            highlightColor = '&H005EC522&'; // MrBeast Neon Green (#22c55e)
            outlineThickness = 4;
            shadowThickness = 2;
            fontSize = 52;
        } else if (normalizedPreset === 'neon') {
            highlightColor = '&H00FFFF00&'; // Electric Cyan (#00ffff)
            outlineThickness = 4;
            shadowThickness = 1;
            fontSize = 48;
        } else if (normalizedPreset === 'minimalist' || normalizedPreset === 'minimal') {
            highlightColor = '&H00FFFFFF&';
            outlineThickness = 2;
            shadowThickness = 0;
            fontSize = 44;
        }

        // Apply custom color if specified (convert Hex #RRGGBB to ASS BGR &H00BBGGRR&)
        if (options?.color && typeof options.color === 'string') {
            const cleanHex = options.color.replace('#', '').trim();
            if (cleanHex.length === 6) {
                const r = cleanHex.substring(0, 2);
                const g = cleanHex.substring(2, 4);
                const b = cleanHex.substring(4, 6);
                highlightColor = `&H00${b}${g}${r}&`.toUpperCase();
            }
        }

        // Apply custom font size if specified (proportional scaling from 28px CSS preview to 1080p canvas)
        if (options?.fontSize && typeof options.fontSize === 'number' && options.fontSize > 0) {
            fontSize = Math.round(Math.min(84, Math.max(32, options.fontSize * (52 / 28))));
        }

        // Apply custom vertical alignment & margin
        let alignment = 2; // Bottom Center
        let marginV = 380;
        if (options?.position === 'top') {
            alignment = 8; // Top Center
            marginV = 220;
        } else if (options?.position === 'middle') {
            alignment = 5; // Middle Center
            marginV = 0;
        } else {
            alignment = 2; // Bottom Center
            marginV = 380;
        }

        const fontName = process.env.EXCERPT_CAPTION_FONT || 'Montserrat';
        let assContent = `[Script Info]
Title: Excerpt SOTA Kinetic Captions (${preset.toUpperCase()})
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,${isItalic},0,0,100,100,0,0,1,${outlineThickness},${shadowThickness},${alignment},80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        // Sanitize and sort words chronologically
        words = [...words]
            .map(w => {
                const s = Math.max(0, Number(w.start) || 0);
                const e = clipDurationSec ? Math.min(clipDurationSec, Number(w.end) || 0) : (Number(w.end) || 0);
                return {
                    start: s,
                    end: e,
                    word: (w.word || '').replace(/[{}\\]/g, '').trim(),
                };
            })
            .filter(w => w.word.length > 0 && w.end > w.start)
            .sort((a, b) => a.start - b.start);

        // Assertions: firstCaption >= 0, lastCaption <= clipDurationSec
        if (words.length > 0) {
            const firstCaption = words[0].start;
            const lastCaption = words[words.length - 1].end;
            if (firstCaption < 0) {
                throw new Error(`[KineticCaptionGenerator]: Assertion failed - firstCaption (${firstCaption}) < 0`);
            }
            if (clipDurationSec && lastCaption > clipDurationSec + 0.05) {
                words[words.length - 1].end = clipDurationSec;
            }
        }

        // Enforce strictly increasing start times to prevent overlaps/collisions
        for (let i = 0; i < words.length - 1; i++) {
            if (words[i+1].start <= words[i].start) {
                words[i+1].start = words[i].start + 0.01;
            }
        }

        // Prevent overlapping by clamping end times to the start of the next word
        for (let i = 0; i < words.length - 1; i++) {
            if (words[i].end > words[i+1].start) {
                words[i].end = words[i+1].start;
            }
        }

        // Group words into punchy, high-retention phrases (1-2 words, max 12 chars)
        // Prevents horizontal overflow on 9:16 vertical viewports
        const phrases: {words: typeof words; start: number; end: number}[] = [];
        let currentGroup: typeof words = [];

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            currentGroup.push(w);

            const hasPunctuation = /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g.test(w.word);
            const nextW = words[i + 1];
            const isGap = nextW ? (nextW.start - w.end > 0.35) : false;

            const currentChars = currentGroup.reduce((acc, item) => acc + item.word.length, 0);
            const nextWordChars = nextW ? nextW.word.length : 0;

            const isFull = currentGroup.length >= 2
                || currentChars >= 10
                || (currentChars + nextWordChars > 12);

            if (isGap || isFull || hasPunctuation || !nextW) {
                phrases.push({
                    words: currentGroup,
                    start: currentGroup[0].start,
                    end: currentGroup[currentGroup.length - 1].end,
                });
                currentGroup = [];
            }
        }

        // Write ASS events
        phrases.forEach((phrase) => {
            phrase.words.forEach((activeW, activeIdx) => {
                const startASS = this.formatTime(activeW.start);
                
                // Determine the next start time to end this word's highlight cleanly
                const nextStart = phrase.words[activeIdx + 1]
                    ? phrase.words[activeIdx + 1].start
                    : phrase.end;
                
                // Ensure end time matches next start time to prevent overlap stack shifting in libass
                const rawClampedEnd = nextStart > activeW.start ? nextStart : activeW.start + 0.01;
                const clampedEndVal = clipDurationSec ? Math.min(clipDurationSec, rawClampedEnd) : rawClampedEnd;
                const endASS = this.formatTime(clampedEndVal);
                
                // Active word has kinetic scale effect and emoji injection
                const phraseText = phrase.words.map((w, idx) => {
                    const cleanWord = w.word.toUpperCase();
                    const emoji = this.getEmojiForWord(w.word);
                    const formatted = emoji ? `${cleanWord} ${emoji}` : cleanWord;
                    
                    if (idx === activeIdx) {
                        return `{\\1c${highlightColor}\\t(0,70,\\fscx108\\fscy108)\\t(70,140,\\fscx100\\fscy100)}${formatted}{\\fscx100\\fscy100\\1c&HFFFFFF&}`;
                    }
                    return formatted;
                }).join(" ");

                const line = `Dialogue: 0,${startASS},${endASS},Default,,0,0,0,,${phraseText}\n`;
                assContent += line;
            });
        });

        const dir = path.dirname(outputPath);
        if (dir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, assContent);
    }

    private formatTime(seconds: number) {
        const totalCentiseconds = Math.round(Math.max(0, seconds) * 100);
        const cs = totalCentiseconds % 100;
        const totalSeconds = Math.floor(totalCentiseconds / 100);
        const s = totalSeconds % 60;
        const m = Math.floor(totalSeconds / 60) % 60;
        const h = Math.floor(totalSeconds / 3600);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
    }
}
