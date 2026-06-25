import os
import sys
import json
import argparse
from pathlib import Path

# Preset style configurations matching viral social formats
STYLE_PRESETS = {
    "tiktok": {
        "font_name": "Arial Black",
        "font_size": 95,
        "primary_color": "&H00FFFFFF&",    # White (ABGR format)
        "highlight_color": "&H0000FF00&",  # Neon Green
        "outline_color": "&H00000000&",    # Black
        "back_color": "&H00000000&",       # Translucent
        "outline": 5,
        "shadow": 0,
        "alignment": 2,                    # Bottom center
        "margin_v": 450,
        "use_neon": True,
        "neon_color": "&H0000FF00&"
    },
    "youtube_shorts": {
        "font_name": "Impact",
        "font_size": 100,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H0000FFFF&",  # Neon Yellow
        "outline_color": "&H00000000&",
        "back_color": "&H00000000&",
        "outline": 6,
        "shadow": 2,
        "alignment": 2,
        "margin_v": 380,
        "use_neon": False,
        "neon_color": None
    },
    "instagram_reels": {
        "font_name": "Montserrat ExtraBold",
        "font_size": 85,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H005080FF&",  # Coral / Light Red
        "outline_color": "&H00222222&",
        "back_color": "&H00000000&",
        "outline": 4,
        "shadow": 1,
        "alignment": 2,
        "margin_v": 280,
        "use_neon": True,
        "neon_color": "&H008080FF&"
    },
    "neon_blue": {
        "font_name": "Arial Black",
        "font_size": 90,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H00FFFF00&",  # Cyan
        "outline_color": "&H00FFFF00&",    # Cyan outline for glow
        "back_color": "&H00000000&",
        "outline": 6,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 420,
        "use_neon": True,
        "neon_color": "&H00FFFF00&"
    },
    "neon_pink": {
        "font_name": "Arial Black",
        "font_size": 90,
        "primary_color": "&H00FFFFFF&",
        "highlight_color": "&H00FF00FF&",  # Hot Pink
        "outline_color": "&H00FF00FF&",    # Hot Pink outline for glow
        "back_color": "&H00000000&",
        "outline": 6,
        "shadow": 0,
        "alignment": 2,
        "margin_v": 420,
        "use_neon": True,
        "neon_color": "&H00FF00FF&"
    }
}

# Rich Emoji Mapping Engine
EMOJI_MAP = {
    "fire": "🔥", "lit": "🔥", "hot": "🔥",
    "great": "🙌", "awesome": "🙌", "amazing": "🙌",
    "best": "🏆", "win": "🏆", "winner": "🏆", "champion": "🏆",
    "game": "🎮", "play": "🎮",
    "moment": "⏰", "time": "⏰", "clock": "⏰",
    "viral": "⚡", "power": "🔋", "energy": "⚡",
    "love": "❤️", "heart": "❤️", "like": "❤️",
    "cool": "😎", "smart": "😎",
    "mind": "🧠", "think": "🧠", "brain": "🧠", "idea": "🧠",
    "money": "💰", "cash": "💰", "rich": "💰", "dollar": "💵",
    "work": "💼", "business": "💼", "hustle": "💪",
    "life": "🌱", "growth": "🌱",
    "unbelievable": "🤯", "insane": "🤯", "crazy": "🤯", "shocked": "🤯",
    "secret": "🤫", "quiet": "🤫",
    "stop": "🛑", "danger": "⚠️", "warning": "⚠️",
    "hacks": "💡", "solution": "💡", "tips": "💡",
    "target": "🎯", "goal": "🎯",
    "rocket": "🚀", "moon": "🚀", "fast": "⚡",
    "laugh": "😂", "funny": "😂", "lol": "😂"
}

# Punch Words dictionary for high-accent highlights (styled with distinct colors/larger scale)
PUNCH_WORDS = {
    "unbelievable": "&H000000FF&",  # Bright Red
    "insane": "&H000000FF&",
    "fire": "&H0000FFFF&",          # Yellow/Orange
    "money": "&H0000FF00&",         # Green
    "secret": "&H00FF00FF&",        # Pink
    "danger": "&H000000FF&",
    "viral": "&H0000FFFF&",
    "best": "&H0000FFFF&",
    "never": "&H000000FF&",
    "always": "&H0000FF00&",
    "stop": "&H000000FF&",
    "huge": "&H0000FFFF&",
    "magic": "&H00FF00FF&"
}

class ASSCaptionCompiler:
    def __init__(self, preset="tiktok", emoji_level="medium"):
        self.style = STYLE_PRESETS.get(preset, STYLE_PRESETS["tiktok"])
        self.preset_name = preset
        self.emoji_level = emoji_level

    def get_emoji(self, word):
        if self.emoji_level == "none":
            return ""
        clean = word.lower().strip(".,!?\"'()")
        # If high level, enable substring matches or general mapping
        emoji = EMOJI_MAP.get(clean, "")
        if not emoji and self.emoji_level == "high":
            # Check substrings
            for key, val in EMOJI_MAP.items():
                if key in clean:
                    return val
        return emoji

    def get_punch_style(self, word):
        clean = word.lower().strip(".,!?\"'()")
        return PUNCH_WORDS.get(clean, None)

    def format_ass_time(self, seconds):
        ms = int(round((seconds % 1) * 100))
        s = int(seconds) % 60
        m = int(seconds / 60) % 60
        h = int(seconds / 3600)
        return f"{h}:{m:02d}:{s:02d}.{ms:02d}"

    def compile(self, words, output_path):
        """
        Compiles word-level timestamps into a production-grade kinetic subtitle ASS file.
        """
        # Header configuration
        ass_header = (
            "[Script Info]\n"
            "Title: Excerpt Kinetic Submagic Captions\n"
            "ScriptType: v4.00+\n"
            "PlayResX: 1080\n"
            "PlayResY: 1920\n\n"
            "[V4+ Styles]\n"
            "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Default,{self.style['font_name']},{self.style['font_size']},{self.style['primary_color']},{self.style['highlight_color']},{self.style['outline_color']},{self.style['back_color']},-1,0,0,0,100,100,0,0,1,{self.style['outline']},{self.style['shadow']},{self.style['alignment']},10,10,{self.style['margin_v']},1\n\n"
            "[Events]\n"
            "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )

        # Sanitize words array
        sanitized_words = []
        for w in words:
            word_str = w.get("word", "").strip()
            if word_str:
                sanitized_words.append({
                    "word": word_str,
                    "start": max(0.0, w.get("start", 0.0)),
                    "end": max(0.0, w.get("end", 0.0))
                })

        # Prevent word overlaps
        for i in range(len(sanitized_words) - 1):
            if sanitized_words[i]["end"] > sanitized_words[i+1]["start"]:
                sanitized_words[i]["end"] = max(sanitized_words[i]["start"] + 0.01, sanitized_words[i+1]["start"] - 0.01)

        # Group words into short phrases (max 3 words or split on punctuation/long gaps)
        phrases = []
        current_phrase = []

        for i, w in enumerate(sanitized_words):
            current_phrase.append(w)
            has_punctuation = any(char in w["word"] for char in ".,!?")
            next_word = sanitized_words[i + 1] if i + 1 < len(sanitized_words) else None
            is_gap = next_word and (next_word["start"] - w["end"] > 0.4)
            is_max = len(current_phrase) >= 3

            if is_gap or is_max or has_punctuation or not next_word:
                phrases.append({
                    "words": current_phrase,
                    "start": current_phrase[0]["start"],
                    "end": current_phrase[-1]["end"]
                })
                current_phrase = []

        # Generate events
        dialogue_lines = []
        for phrase in phrases:
            # Generate dialogue entry for each active word highlight inside the phrase
            for active_idx, active_word in enumerate(phrase["words"]):
                start_ass = self.format_ass_time(active_word["start"])
                # Highlight active word for its duration, then step to next
                end_ass = self.format_ass_time(active_word["end"])

                formatted_words = []
                for idx, w in enumerate(phrase["words"]):
                    clean_word = w["word"].upper()
                    emoji = self.get_emoji(w["word"])
                    
                    # Wrap emojis in Segoe UI Emoji fallback style to avoid rendering issues
                    if emoji:
                        display_word = f"{clean_word} {{\\fnSegoe UI Emoji}}{emoji}{{\\fn}}"
                    else:
                        display_word = clean_word

                    if idx == active_idx:
                        # Highlight active word
                        punch_color = self.get_punch_style(w["word"])
                        color = punch_color if punch_color else self.style["highlight_color"]
                        scale = 130 if punch_color else 115
                        
                        # Build neon glow tags if active
                        glow_tags = ""
                        if self.style["use_neon"] and self.style["neon_color"]:
                            # Outline glow effect
                            glow_tags = f"\\blur3\\3c{self.style['neon_color']}"

                        # Active word expands, glows, changes to highlight color, and remains fully opaque
                        formatted_words.append(
                            f"{{\\1a&H00&\\1c{color}\\{glow_tags}\\fscx{scale}\\fscy{scale}}}{display_word}{{\\fscx100\\fscy100\\blur0\\3c{self.style['outline_color']}\\1c{self.style['primary_color']}}}"
                        )
                    else:
                        # Inactive words are slightly faded (translucent) to focus on the active word
                        formatted_words.append(f"{{\\1a&H44&}}{display_word}{{\\1a&H00&}}")

                phrase_text = " ".join(formatted_words)
                
                # Spring/bounce animation using transform tag \t
                # Scale up to 112% at start, then settle back to 100%
                bounce_tags = "{\\pos(540,1440)}{\\fscx100\\fscy100\\t(0,90,\\fscx112\\fscy112)\\t(90,180,\\fscx100\\fscy100)}"
                
                line = f"Dialogue: 0,{start_ass},{end_ass},Default,,0,0,0,,{bounce_tags}{phrase_text}\n"
                dialogue_lines.append(line)

        # Write output file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(ass_header)
            f.writelines(dialogue_lines)

        print(f"[ASS Compiler]: Subtitles compiled with '{self.preset_name}' style at {output_path}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description="Kinetic ASS Caption Engine")
    parser.add_argument("--words-json", required=True, help="Path to JSON file containing word timestamps")
    parser.add_argument("--output", required=True, help="Path to write compiled ASS file")
    parser.add_argument("--preset", default="tiktok", choices=list(STYLE_PRESETS.keys()), help="Style preset")
    parser.add_argument("--emoji-level", default="medium", choices=["none", "medium", "high"], help="Emoji density level")
    args = parser.parse_args()

    try:
        with open(args.words_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        words = data if isinstance(data, list) else data.get("words", [])
        
        compiler = ASSCaptionCompiler(preset=args.preset, emoji_level=args.emoji_level)
        compiler.compile(words, args.output)
        
        print(json.dumps({
            "status": "success",
            "preset": args.preset,
            "output_file": args.output
        }))
    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()

