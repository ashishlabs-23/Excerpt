import os
import sys
import json
import argparse
import numpy as np

# Import custom GBDT regressor from virality_engine
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from virality_engine import CustomGBDTRegressor

# SQL DATABASE SCHEMAS DEFINITION
DATABASE_SCHEMA_SQL = """
-- Schema for storing extracted retention features
CREATE TABLE IF NOT EXISTS retention_features (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL,
    video_id TEXT NOT NULL,
    
    -- Audio features
    pitch_variation REAL NOT NULL,
    silence_ratio REAL NOT NULL,
    volume_peaks REAL NOT NULL,
    
    -- Visual features
    face_ratio REAL NOT NULL,
    motion_variance REAL NOT NULL,
    brightness REAL NOT NULL,
    
    -- Semantic features
    hook_strength REAL NOT NULL,
    word_complexity REAL NOT NULL,
    sentiment_polarity REAL NOT NULL,
    
    -- Emotion features
    positive_sentiment REAL NOT NULL,
    negative_sentiment REAL NOT NULL,
    emotion_density REAL NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Schema for storing actual and predicted retention metrics
CREATE TABLE IF NOT EXISTS retention_predictions (
    id TEXT PRIMARY KEY,
    segment_id TEXT NOT NULL REFERENCES retention_features(segment_id),
    
    -- Predicted Metrics
    pred_watch_time REAL NOT NULL,
    pred_completion_rate REAL NOT NULL,
    pred_replay_rate REAL NOT NULL,
    pred_scroll_stop_rate REAL NOT NULL,
    
    -- Actual Metrics (Populated post-publish via telemetry logs)
    actual_watch_time REAL DEFAULT NULL,
    actual_completion_rate REAL DEFAULT NULL,
    actual_replay_rate REAL DEFAULT NULL,
    actual_scroll_stop_rate REAL DEFAULT NULL,
    
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

class RetentionPredictor:
    def __init__(self):
        # 4 independent GBDT models to predict the 4 metrics
        self.models = {
            "watch_time": CustomGBDTRegressor(n_estimators=8, max_depth=3),
            "completion_rate": CustomGBDTRegressor(n_estimators=8, max_depth=3),
            "replay_rate": CustomGBDTRegressor(n_estimators=8, max_depth=3),
            "scroll_stop_rate": CustomGBDTRegressor(n_estimators=8, max_depth=3)
        }
        self.feature_names = [
            "pitch_variation", "silence_ratio", "volume_peaks",
            "face_ratio", "motion_variance", "brightness",
            "hook_strength", "word_complexity", "sentiment_polarity",
            "positive_sentiment", "negative_sentiment", "emotion_density"
        ]

    def extract_features(self, audio_data, visual_data, text_data):
        """
        Processes audio, visual, and semantic data to build the 12-dimensional feature set.
        """
        # 1. Audio Features
        pitch_var = audio_data.get("pitch_variation", 0.5)
        silence = audio_data.get("silence_ratio", 0.1)
        peaks = audio_data.get("volume_peaks", 0.4)

        # 2. Visual Features
        face = visual_data.get("face_ratio", 0.6)
        motion = visual_data.get("motion_variance", 0.3)
        brightness = visual_data.get("brightness", 0.5)

        # 3. Semantic Features
        if isinstance(text_data, str):
            hook = 0.5
            complexity = 0.4
            sentiment = 0.6
            pos = 0.5
            neg = 0.2
            density = 0.4
        else:
            hook = text_data.get("hook_strength", 0.5)
            complexity = text_data.get("word_complexity", 0.4)
            sentiment = text_data.get("sentiment_polarity", 0.6)
            pos = text_data.get("positive_sentiment", 0.5)
            neg = text_data.get("negative_sentiment", 0.2)
            density = text_data.get("emotion_density", 0.4)

        return {
            "pitch_variation": round(pitch_var, 3),
            "silence_ratio": round(silence, 3),
            "volume_peaks": round(peaks, 3),
            "face_ratio": round(face, 3),
            "motion_variance": round(motion, 3),
            "brightness": round(brightness, 3),
            "hook_strength": round(hook, 3),
            "word_complexity": round(complexity, 3),
            "sentiment_polarity": round(sentiment, 3),
            "positive_sentiment": round(pos, 3),
            "negative_sentiment": round(neg, 3),
            "emotion_density": round(density, 3)
        }

    def train_pipeline(self, output_dir):
        """
        Trains GBDT regressors for all 4 targets on a synthetic telemetry dataset.
        """
        print("[Retention Engine]: Generating telemetry dataset and training 4 targets...", file=sys.stderr)
        os.makedirs(output_dir, exist_ok=True)
        
        # N=300 samples
        np.random.seed(1337)
        X = np.random.uniform(0.1, 1.0, (300, 12))
        
        # Generate target variables:
        # Watch time (seconds, 0 to 60)
        y_watch = 10.0 + 35.0 * X[:, 6] + 15.0 * X[:, 3] - 10.0 * X[:, 1]
        y_watch = np.clip(y_watch, 0.0, 60.0)
        
        # Completion Rate (ratio, 0.0 to 1.0)
        y_complete = 0.2 + 0.5 * X[:, 6] + 0.3 * X[:, 9] - 0.2 * X[:, 7]
        y_complete = np.clip(y_complete, 0.0, 1.0)
        
        # Replay Rate (ratio, 0.0 to 1.0)
        y_replay = 0.05 + 0.4 * X[:, 0] + 0.3 * X[:, 4] - 0.2 * X[:, 1]
        y_replay = np.clip(y_replay, 0.0, 1.0)
        
        # Scroll Stop Rate (ratio, 0.0 to 1.0)
        y_scroll = 0.1 + 0.6 * X[:, 6] + 0.3 * X[:, 2] - 0.1 * X[:, 10]
        y_scroll = np.clip(y_scroll, 0.0, 1.0)

        # Fit all targets
        self.models["watch_time"].fit(X, y_watch)
        self.models["completion_rate"].fit(X, y_complete)
        self.models["replay_rate"].fit(X, y_replay)
        self.models["scroll_stop_rate"].fit(X, y_scroll)

        # Save model JSON files
        for name, model in self.models.items():
            model_path = os.path.join(output_dir, f"{name}_model.json")
            with open(model_path, "w", encoding="utf-8") as f:
                json.dump(model.to_json(), f, indent=2)
                
        print(f"[Retention Engine]: Models saved in directory: {output_dir}", file=sys.stderr)

    def load_models(self, model_dir):
        for name in self.models.keys():
            model_path = os.path.join(model_dir, f"{name}_model.json")
            with open(model_path, "r", encoding="utf-8") as f:
                self.models[name].load_json(json.load(f))

    def predict_all(self, features):
        X = np.array([[features[name] for name in self.feature_names]])
        
        watch = float(np.clip(self.models["watch_time"].predict(X)[0], 0.0, 60.0))
        complete = float(np.clip(self.models["completion_rate"].predict(X)[0], 0.0, 1.0))
        replay = float(np.clip(self.models["replay_rate"].predict(X)[0], 0.0, 1.0))
        scroll = float(np.clip(self.models["scroll_stop_rate"].predict(X)[0], 0.0, 1.0))

        return {
            "watch_time_sec": round(watch, 2),
            "completion_rate": round(complete, 4),
            "replay_rate": round(replay, 4),
            "scroll_stop_rate": round(scroll, 4)
        }

def main():
    parser = argparse.ArgumentParser(description="Excerpt Multi-Target Retention Engine")
    parser.add_argument("--mode", required=True, choices=["train", "predict"], help="Operational mode")
    parser.add_argument("--model-dir", required=True, help="Directory to save/load model weights JSON files")
    parser.add_argument("--input-json", help="Path to input features JSON (needed for predict)")
    parser.add_argument("--output-json", help="Path to save prediction outputs JSON")
    args = parser.parse_args()

    predictor = RetentionPredictor()

    if args.mode == "train":
        predictor.train_pipeline(args.model_dir)
        print(json.dumps({"status": "success", "message": "Retention models trained and saved."}))
        
    elif args.mode == "predict":
        if not args.input_json or not args.output_json:
            print(json.dumps({"status": "failed", "error": "Must provide --input-json and --output-json for predict mode"}))
            sys.exit(1)
            
        try:
            predictor.load_models(args.model_dir)
            
            with open(args.input_json, "r", encoding="utf-8") as f:
                input_data = json.load(f)

            segments = input_data.get("segments", [])
            results = []

            for seg in segments:
                audio = seg.get("audio", {})
                visual = seg.get("visual", {})
                text = seg.get("text", {})
                
                features = predictor.extract_features(audio, visual, text)
                predictions = predictor.predict_all(features)
                
                results.append({
                    "id": seg.get("id"),
                    "predictions": predictions,
                    "features": features
                })

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
