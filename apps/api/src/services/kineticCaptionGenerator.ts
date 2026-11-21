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
        'cheap': '💸',
        'cost': '💸',
        'save': '💸',
        'rag': '⚡',
        'ai': '🤖',
        'code': '💻',
        'died': '💀',
        'dead': '💀',
        'kill': '💀',
        'cry': '😭',
        'crying': '😭',
        'god': '🙏',
        'pray': '🙏',
        'problem': '⚠️',
        'danger': '⚠️',
        'rich': '🤑',
        'truth': '🎯',
        'hack': '💡',
        'air': '💨',
    };

    private static readonly POWER_WORDS_FINANCIAL = new Set([
        'money', 'cash', 'dollars', 'dollar', 'rag', 'cost', 'cheap', 'cheaper', 'cheapest',
        'expensive', 'revenue', 'profit', 'free', 'save', 'saving', 'growth', 'scale', 'scaling',
        'rich', 'wealth', 'pay', 'paid', 'roi', 'billion', 'million', 'thousand', '10x', '100x',
        '5x', '2x', 'pricing', 'discount'
    ]);

    private static readonly POWER_WORDS_WARNING = new Set([
        'stop', 'never', 'worst', 'danger', 'deadly', 'destroy', 'kill', 'killed', 'disaster',
        'fail', 'failure', 'failed', 'scam', 'fake', 'lie', 'lies', 'warning', 'bad', 'toxic',
        'hate', 'ruin', 'ruined', 'mistake', 'wrong', 'problem', 'problems', 'ban', 'banned'
    ]);

    private static readonly POWER_WORDS_EMPHASIS = new Set([
        'secret', 'insane', 'crazy', 'huge', 'always', 'truth', 'proven', 'hack', 'genius',
        'unbelievable', 'shocking', 'epic', 'wild', 'massive', 'magic', 'gamechanger',
        'best', 'must', 'crucial', 'essential', 'ultimate'
    ]);

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
            yPercent?: number;
            color?: string;
            aspectRatio?: '9:16' | '16:9';
            framingMode?: string;
            headlineText?: string;
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

        const isFitHeadline = options?.framingMode === 'fit_headline' || options?.framingMode === 'fit_letterbox' || options?.framingMode === 'fit_card' || Boolean(options?.headlineText && options?.aspectRatio !== '16:9');
        const isLandscape = options?.aspectRatio === '16:9' && !isFitHeadline;
        const resX = isLandscape ? 1920 : 1080;
        const resY = isLandscape ? 1080 : 1920;

        // Apply custom vertical alignment & margin
        let alignment = 2; // Bottom Center
        let marginV = isLandscape ? 90 : (isFitHeadline ? 240 : 380);
        if (options?.yPercent !== undefined && typeof options.yPercent === 'number' && !isNaN(options.yPercent)) {
            const yClamped = Math.max(10, Math.min(90, options.yPercent));
            // yPercent is distance from top (0% at top, 100% at bottom).
            // MarginV with alignment 2 is distance from the bottom edge.
            marginV = Math.round(resY * (1 - yClamped / 100));
            alignment = 2;
        } else if (options?.position === 'top') {
            alignment = 8; // Top Center
            marginV = isLandscape ? 80 : 220;
        } else if (options?.position === 'middle') {
            alignment = 5; // Middle Center
            marginV = 0;
        } else {
            alignment = 2; // Bottom Center
            marginV = isLandscape ? 90 : (isFitHeadline ? 240 : 380);
        }

        const fontName = process.env.EXCERPT_CAPTION_FONT || 'Montserrat';
        let assContent = `[Script Info]
Title: Excerpt SOTA Kinetic Captions (${preset.toUpperCase()})
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${resX}
PlayResY: ${resY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,${isItalic},0,0,100,100,0,0,1,${outlineThickness},${shadowThickness},${alignment},80,80,${marginV},1
Style: TopHeadline,${fontName},48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,8,90,90,140,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        // Burn-in persistent viral hook headline if fit_headline layout is active
        if (options?.headlineText && options.headlineText.trim().length > 0) {
            const wrapHeadline = (text: string, maxChars = 34): string => {
                const clean = text.replace(/[{}\\]/g, '').trim();
                const wordsArr = clean.split(/\s+/);
                const lines: string[] = [];
                let cur = '';
                for (const w of wordsArr) {
                    if ((cur + ' ' + w).trim().length <= maxChars) {
                        cur = (cur + ' ' + w).trim();
                    } else {
                        if (cur) lines.push(cur);
                        cur = w;
                    }
                }
                if (cur) lines.push(cur);
                return lines.join('\\N');
            };
            const wrapped = wrapHeadline(options.headlineText);
            const maxEnd = clipDurationSec || (words.length > 0 ? words[words.length - 1].end + 5 : 60);
            assContent += `Dialogue: 0,0:00:00.00,${this.formatTime(maxEnd)},TopHeadline,,0,0,0,,{\\q2}${wrapped}\n`;
        }

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
                        const rawClean = w.word.toLowerCase().replace(/[^a-z0-9$%]/g, '');
                        let wordHighlightColor = highlightColor;
                        let scalePop = 108;

                        if (KineticCaptionGenerator.POWER_WORDS_FINANCIAL.has(rawClean) || /^(\$|\d+x|\d+%)|(\d+k|\d+m|\d+b)$/i.test(rawClean)) {
                            wordHighlightColor = '&H005EC522&'; // Neon Emerald Green (#22c55e)
                            scalePop = 118;
                        } else if (KineticCaptionGenerator.POWER_WORDS_WARNING.has(rawClean)) {
                            wordHighlightColor = '&H003333EF&'; // Vibrant Coral Red (#ef4444)
                            scalePop = 118;
                        } else if (KineticCaptionGenerator.POWER_WORDS_EMPHASIS.has(rawClean)) {
                            wordHighlightColor = '&H0008D9FA&'; // Electric Gold (#fad908)
                            scalePop = 118;
                        }

                        return `{\\1c${wordHighlightColor}\\t(0,70,\\fscx${scalePop}\\fscy${scalePop})\\t(70,140,\\fscx100\\fscy100)}${formatted}{\\fscx100\\fscy100\\1c&HFFFFFF&}`;
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
