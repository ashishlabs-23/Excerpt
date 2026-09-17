import os
import sys
import json
import argparse
import numpy as np

class EmotionEngine:
    def __init__(self):
        self.emotion_categories = ["surprise", "excitement", "anger", "laughter", "shock"]

    def analyze_frame(self, frame_idx, timestamp, face_data, voice_data, crowd_data):
        """
        Fuses visual, vocal, and crowd features to calculate confidence scores for 5 emotions.
        """
        face = face_data or {}
        voice = voice_data or {}
        crowd = crowd_data or {}

        # 1. Extract raw features (with default fallbacks)
        smile = face.get("smile_score", 0.0)
        brow_raise = face.get("brow_raise", 0.0)
        mouth_open = face.get("mouth_open", 0.0)

        pitch_var = voice.get("pitch_variance", 0.0)
        db = voice.get("db", 50.0)
        # Normalize decibels: 50dB is 0.0, 100dB is 1.0
        vocal_energy = np.clip((db - 50.0) / 50.0, 0.0, 1.0)
        speaking_pace = voice.get("speaking_pace", 0.0)

        cheer = crowd.get("cheering", 0.0)
        applause = crowd.get("applause", 0.0)
        crowd_density = crowd.get("density", 0.0)

        # 2. Calculate scores for each emotion
        # Surprise: brow raise + mouth open + pitch variance
        surprise_score = 0.4 * brow_raise + 0.3 * mouth_open + 0.3 * pitch_var

        # Excitement: smile + pitch variance + speaking pace + cheer + energy
        excitement_score = 0.2 * smile + 0.2 * pitch_var + 0.2 * speaking_pace + 0.2 * cheer + 0.2 * vocal_energy

        # Anger: low smile + high energy + low pitch variance + aggressive speaking pace
        anger_score = 0.4 * (1.0 - smile) + 0.4 * vocal_energy + 0.2 * (1.0 - pitch_var)

        # Laughter: smile + mouth open + applause/cheer
        laughter_score = 0.4 * smile + 0.3 * mouth_open + 0.3 * max(applause, cheer)

        # Shock: high brow raise + mouth open + sudden vocal energy (gasp) with low smile
        shock_score = 0.3 * brow_raise + 0.3 * mouth_open + 0.3 * vocal_energy + 0.1 * (1.0 - smile)

        # Clip scores to [0.0, 1.0]
        emotions = {
            "surprise": round(float(np.clip(surprise_score, 0.0, 1.0)), 4),
            "excitement": round(float(np.clip(excitement_score, 0.0, 1.0)), 4),
            "anger": round(float(np.clip(anger_score, 0.0, 1.0)), 4),
            "laughter": round(float(np.clip(laughter_score, 0.0, 1.0)), 4),
            "shock": round(float(np.clip(shock_score, 0.0, 1.0)), 4)
        }

        # Determine primary emotion
        primary_emotion = max(emotions, key=emotions.get)
        confidence = emotions[primary_emotion]

        return {
            "frame": frame_idx,
            "timestamp": round(float(timestamp), 2),
            "primary_emotion": primary_emotion,
            "confidence": confidence,
            "emotions": emotions
        }

    def process_timeline(self, timeline):
        results = []
        for idx, entry in enumerate(timeline):
            frame_idx = entry.get("frame_idx", idx)
            timestamp = entry.get("timestamp", idx / 30.0)
            face_data = entry.get("face_data", {})
            voice_data = entry.get("voice_data", {})
            crowd_data = entry.get("crowd_data", {})
            
            res = self.analyze_frame(frame_idx, timestamp, face_data, voice_data, crowd_data)
            results.append(res)
        return results

def main():
    parser = argparse.ArgumentParser(description="Multimodal Emotion AI Engine")
    parser.add_argument("--input-json", required=True, help="Path to input tracking + audio timeline JSON")
    parser.add_argument("--output-json", required=True, help="Path to write emotion timeline JSON")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)

        timeline = timeline_data.get("results", []) if isinstance(timeline_data, dict) else timeline_data
        
        engine = EmotionEngine()
        results = engine.process_timeline(timeline)

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
