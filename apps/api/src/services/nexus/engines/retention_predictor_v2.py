import os
import sys
import json
import argparse

class RetentionPredictorV2:
    def __init__(self):
        pass

    def predict_retention(self, features):
        hook = features.get("hook_strength", 0.5)
        hype = features.get("commentary_hype", 0.5)
        emotion = features.get("emotion_peak", 0.5)
        motion = features.get("motion_peak", 0.5)
        surprise = features.get("surprise_score", 0.5)
        story = features.get("story_completeness", 0.5)
        ball = features.get("ball_visibility", 0.5)
        tension = features.get("tension_score", 0.5)

        # Weighted retention formula
        raw_score = (
            (hook * 0.20) +
            (hype * 0.15) +
            (emotion * 0.10) +
            (motion * 0.05) +
            (surprise * 0.10) +
            (story * 0.10) +
            (ball * 0.15) +
            (tension * 0.15)
        )

        predicted_watch_time = min(1.0, max(0.0, raw_score))

        return {
            "predicted_watch_time": round(predicted_watch_time, 4),
            "viral_potential": "high" if predicted_watch_time > 0.80 else "standard"
        }

def main():
    parser = argparse.ArgumentParser(description="Retention Predictor Engine (v2)")
    parser.add_argument("--features-json", required=True, help="Path to input features JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write retention prediction")
    args = parser.parse_args()

    try:
        with open(args.features_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        features = data.get("features", {}) if "features" in data else data
        predictor = RetentionPredictorV2()
        result = predictor.predict_retention(features)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "prediction": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "prediction": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
