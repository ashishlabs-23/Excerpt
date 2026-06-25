import os
import sys
import json
import argparse
import numpy as np

class GoldenMomentEngine:
    def __init__(self, weights=None):
        self.weights = weights or {
            "surprise": 0.20,
            "laughter": 0.20,
            "reveal": 0.15,
            "controversy": 0.15,
            "emotion": 0.15,
            "crowd": 0.15
        }
        
        # Word lists for text-based heuristics
        self.reveal_keywords = ["introducing", "behold", "here is", "look", "show", "finally", "revealed", "unboxing", "presenting"]
        self.controversy_keywords = ["wrong", "disagree", "lie", "fake", "argument", "debate", "nonsense", "hate", "scam", "myth", "refuse"]
        self.laughter_keywords = ["haha", "lol", "funny", "laughing", "joke", "hilarious", "[laughter]", "[laughs]"]

    def calculate_moment_score(self, transcript, audio_metrics, visual_metrics, emotion_metrics):
        """
        Calculates sub-scores and aggregates them into a final golden moment score.
        """
        clean_text = transcript.lower()

        # 1. Surprise Score: Audio volume transients or visual speed spikes
        vol_change = audio_metrics.get("volume_transient", 0.0)
        motion_spike = visual_metrics.get("motion_transient", 0.0)
        s_surprise = min(1.0, max(vol_change, motion_spike))

        # 2. Laughter Score: Text keywords or laughter flags
        laughter_hits = sum(1 for w in self.laughter_keywords if w in clean_text)
        laughter_tag = 1.0 if "[laughter]" in clean_text or "[laughs]" in clean_text else 0.0
        s_laughter = min(1.0, (laughter_hits * 0.4) + laughter_tag)

        # 3. Reveal Score: Text cues indicating a showcase / payoff moment
        reveal_hits = sum(1 for w in self.reveal_keywords if w in clean_text)
        s_reveal = min(1.0, reveal_hits * 0.5)

        # 4. Controversy Score: Clashing / argumentative speech markers
        controversy_hits = sum(1 for w in self.controversy_keywords if w in clean_text)
        neg_sentiment = emotion_metrics.get("negative_sentiment", 0.0)
        s_controversy = min(1.0, (controversy_hits * 0.4) + (neg_sentiment * 0.3))

        # 5. Emotional Spike Score: Extremes of positive or negative sentiment
        pos_sentiment = emotion_metrics.get("positive_sentiment", 0.0)
        neg_sentiment = emotion_metrics.get("negative_sentiment", 0.0)
        s_emotion = min(1.0, max(pos_sentiment, neg_sentiment))

        # 6. Crowd Reaction Score: Cheering/Applause triggers or volume peaks
        cheering = audio_metrics.get("applause", 0.0)
        vol_peak = audio_metrics.get("volume_peak", 0.0)
        s_crowd = min(1.0, cheering * 0.7 + vol_peak * 0.3)

        # Weighted Sum
        golden_score = (
            self.weights["surprise"] * s_surprise +
            self.weights["laughter"] * s_laughter +
            self.weights["reveal"] * s_reveal +
            self.weights["controversy"] * s_controversy +
            self.weights["emotion"] * s_emotion +
            self.weights["crowd"] * s_crowd
        )

        return {
            "golden_moment_score": round(golden_score, 4),
            "breakdown": {
                "surprise": round(s_surprise, 3),
                "laughter": round(s_laughter, 3),
                "reveal": round(s_reveal, 3),
                "controversy": round(s_controversy, 3),
                "emotion": round(s_emotion, 3),
                "crowd": round(s_crowd, 3)
            }
        }

    def process_timeline(self, segments, threshold=0.70):
        """
        Evaluates a list of segments and returns the best golden moments.
        """
        results = []
        for seg in segments:
            transcript = seg.get("text", "")
            audio = seg.get("audio", {})
            visual = seg.get("visual", {})
            emotion = seg.get("emotion", {})
            
            score_data = self.calculate_moment_score(transcript, audio, visual, emotion)
            
            results.append({
                "id": seg.get("id"),
                "start": seg.get("start"),
                "end": seg.get("end"),
                "golden_moment_score": score_data["golden_moment_score"],
                "is_golden_moment": score_data["golden_moment_score"] >= threshold,
                "breakdown": score_data["breakdown"]
            })
            
        # Sort by golden moment score descending
        results.sort(key=lambda x: x["golden_moment_score"], reverse=True)
        return results

def main():
    parser = argparse.ArgumentParser(description="Multimodal Golden Moments Engine")
    parser.add_argument("--input-json", required=True, help="Path to input segments JSON file")
    parser.add_argument("--output-json", required=True, help="Path to save golden moment predictions")
    parser.add_argument("--threshold", type=float, default=0.70, help="Score threshold for clipping")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        segments = data.get("segments", []) if isinstance(data, dict) else data
        
        engine = GoldenMomentEngine()
        results = engine.process_timeline(segments, threshold=args.threshold)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": results}, f, indent=2)

        print(json.dumps({
            "status": "success",
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
