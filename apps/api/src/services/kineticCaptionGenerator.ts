import fs from 'fs';

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
        'power': '🔋'
    };

    private getEmojiForWord(word: string): string {
        const clean = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
        return this.emojiMap[clean] || "";
    }

    generateASS(words: {start: number; end: number; word: string}[], outputPath: string) {
        let assContent = `[Script Info]
Title: Excerpt Kinetic Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Black,95,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,2,10,10,480,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        // Sanitize words
        words = words.map(w => {
            return {
                start: Math.max(0, w.start),
                end: Math.max(0, w.end),
                word: w.word.trim(),
            };
        }).filter(w => w.word.length > 0);

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

        // Group words into phrases (max 3 words for high kinetic energy)
        const phrases: {words: typeof words; start: number; end: number}[] = [];
        let currentGroup: typeof words = [];

        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            currentGroup.push(w);

            const hasPunctuation = /[.,\/#!$%\^&\*;:{}=\-_`~()?]/g.test(w.word);
            const nextW = words[i + 1];
            const isGap = nextW ? (nextW.start - w.end > 0.4) : false;
            const isMaxWords = currentGroup.length >= 3;

            if (isGap || isMaxWords || hasPunctuation || !nextW) {
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
                const clampedEndVal = nextStart > activeW.start ? nextStart : activeW.start + 0.01;
                const endASS = this.formatTime(clampedEndVal);
                
                // Active word has kinetic scale effect and emoji injection
                const phraseText = phrase.words.map((w, idx) => {
                    const cleanWord = w.word.toUpperCase();
                    const emoji = this.getEmojiForWord(w.word);
                    const formatted = emoji ? `${cleanWord} ${emoji}` : cleanWord;
                    
                    if (idx === activeIdx) {
                        // Highlight in vibrant neon yellow/green (&H00FF00& or &H00FFFF&) and apply rotation & scale
                        return `{\\1c&H00FF00&}{\\fscx115\\fscy115}${formatted}{\\fscx100\\fscy100}{\\1c&HFFFFFF&}`;
                    }
                    return formatted;
                }).join(" ");

                // Positioned at 75% height with a dynamic scale transition \t
                const line = `Dialogue: 0,${startASS},${endASS},Default,,0,0,0,,{\\pos(540,1440)}{\\fscx100\\fscy100\\t(0,120,\\fscx115\\fscy115)\\t(120,240,\\fscx100\\fscy100)}${phraseText}\n`;
                assContent += line;
            });
        });

        fs.writeFileSync(outputPath, assContent);
    }

    private formatTime(seconds: number) {
        const ms = Math.floor((seconds % 1) * 100);
        const s = Math.floor(seconds) % 60;
        const m = Math.floor(seconds / 60) % 60;
        const h = Math.floor(seconds / 3600);
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
}
