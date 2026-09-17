import os
import sys
import json
import argparse
import numpy as np

class GoldenMomentEngine:
    def __init__(self):
        # Weights for sub-scorers
        self.w_reveals = 0.15
        self.w_shocks = 0.20
        self.w_controversy = 0.15
        self.w_laughter = 0.15
        self.w_crowd = 0.20
        self.w_peaks = 0.15

        # Keyphrase dictionaries
        self.reveal_keys = {"reveal", "unboxing", "look", "behold", "showcase", "introducing", "presenting", "finally"}
        self.controversy_keys = {"wrong", "disagree", "lie", "fake", "refuse", "cheat", "scam", "nonsense", "fight"}
        self.laughter_keys = {"haha", "lol", "funny", "laughing", "joke", "hilarious"}

    def calculate_moment(self, segment):
        """
        Combines Speech, Motion, Attention, Events, and Emotion to calculate a Golden Moment Score.
        """
        timestamp = segment.get("timestamp", 0.0)
        speech = segment.get("speech", "").lower()
        emotion = segment.get("emotion", {})
        motion = segment.get("motion", {})
        events = segment.get("events", [])
        attention = segment.get("attention", {})

        # 1. Reveals Score
        speech_words = set(speech.split())
        reveal_speech = 1.0 if speech_words.intersection(self.reveal_keys) else 0.0
        # High attention concentration (e.g. gaze focus density) increases reveal score
        att_focus = attention.get("focus_density", 0.5)
        s_reveals = 0.5 * reveal_speech + 0.5 * att_focus

        # 2. Shocks Score
        surprise_val = emotion.get("surprise", 0.0)
        shock_val = emotion.get("shock", 0.0)
        vocal_db = segment.get("audio_db", 60.0)
        # Normalize vocal volume: >85dB is peak
        vocal_intensity = np.clip((vocal_db - 50.0) / 40.0, 0.0, 1.0)
        s_shocks = 0.4 * surprise_val + 0.3 * shock_val + 0.3 * vocal_intensity

        # 3. Controversy Score
        anger_val = emotion.get("anger", 0.0)
        cont_speech = 1.0 if speech_words.intersection(self.controversy_keys) else 0.0
        s_controversy = 0.6 * anger_val + 0.4 * cont_speech

        # 4. Laughter Score
        laughter_val = emotion.get("laughter", 0.0)
        laugh_speech = 1.0 if speech_words.intersection(self.laughter_keys) else 0.0
        s_laughter = 0.6 * laughter_val + 0.4 * laugh_speech

        # 5. Crowd Eruptions Score
        cheering = 1.0 if any(e in ["cheering", "crowd_reaction", "applause"] for e in events) else 0.0
        motion_mag = motion.get("magnitude", 0.0)
        # Normalize motion magnitude (0.08 is typical peak)
        motion_intensity = np.clip(motion_mag * 12.0, 0.0, 1.0)
        s_crowd = 0.6 * cheering + 0.4 * motion_intensity

        # 6. Emotional Peaks Score
        all_emotions = [
            emotion.get("surprise", 0.0),
            emotion.get("excitement", 0.0),
            emotion.get("anger", 0.0),
            emotion.get("laughter", 0.0),
            emotion.get("shock", 0.0),
            emotion.get("joy", 0.0)
        ]
        s_peaks = max(all_emotions) if all_emotions else 0.0

        # Weighted raw score in [0.0, 1.0]
        raw_score = (
            self.w_reveals * s_reveals +
            self.w_shocks * s_shocks +
            self.w_controversy * s_controversy +
            self.w_laughter * s_laughter +
            self.w_crowd * s_crowd +
            self.w_peaks * s_peaks
        )
        
        # Scale score to [0, 100] range
        moment_score = int(round(raw_score * 100))
        
        return {
            "moment_score": moment_score,
            "timestamp": round(float(timestamp), 2),
            "breakdown": {
                "reveals": round(float(s_reveals), 2),
                "shocks": round(float(s_shocks), 2),
                "controversy": round(float(s_controversy), 2),
                "laughter": round(float(s_laughter), 2),
                "crowd_eruptions": round(float(s_crowd), 2),
                "emotional_peaks": round(float(s_peaks), 2)
            }
        }

    def process_timeline(self, timeline):
        results = []
        for idx, entry in enumerate(timeline):
            res = self.calculate_moment(entry)
            results.append(res)
            
        # Rank by score descending
        results.sort(key=lambda x: x["moment_score"], reverse=True)
        return results

def main():
    parser = argparse.ArgumentParser(description="Golden Moment Detection Engine")
    parser.add_argument("--input-json", required=True, help="Path to input timeline segments JSON")
    parser.add_argument("--output-json", required=True, help="Path to save ranked golden moments JSON")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        timeline = data.get("results", []) if isinstance(data, dict) else data
        
        engine = GoldenMomentEngine()
        ranked_results = engine.process_timeline(timeline)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": ranked_results}, f, indent=2)

        # Output the best moment directly
        best_moment = ranked_results[0] if ranked_results else {"moment_score": 0, "timestamp": 0.0}
        print(json.dumps({
            "status": "success",
            "moment_score": best_moment["moment_score"],
            "timestamp": best_moment["timestamp"],
            "output_file": args.output_json
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
