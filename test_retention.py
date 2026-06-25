import sys
import os
import unittest
import json
import tempfile
import numpy as np

sys.path.append("apps/api/scripts")
from retention_engine import RetentionPredictor

class TestRetentionEngine(unittest.TestCase):
    def test_feature_extraction(self):
        predictor = RetentionPredictor()
        
        audio = {"pitch_variation": 0.6, "silence_ratio": 0.05, "volume_peaks": 0.7}
        visual = {"face_ratio": 0.8, "motion_variance": 0.4, "brightness": 0.5}
        text = {
            "hook_strength": 0.9, "word_complexity": 0.3, "sentiment_polarity": 0.8,
            "positive_sentiment": 0.7, "negative_sentiment": 0.1, "emotion_density": 0.6
        }
        
        features = predictor.extract_features(audio, visual, text)
        
        self.assertEqual(features["pitch_variation"], 0.6)
        self.assertEqual(features["silence_ratio"], 0.05)
        self.assertEqual(features["volume_peaks"], 0.7)
        self.assertEqual(features["face_ratio"], 0.8)
        self.assertEqual(features["motion_variance"], 0.4)
        self.assertEqual(features["brightness"], 0.5)
        self.assertEqual(features["hook_strength"], 0.9)
        self.assertEqual(features["word_complexity"], 0.3)
        self.assertEqual(features["sentiment_polarity"], 0.8)
        self.assertEqual(features["positive_sentiment"], 0.7)
        self.assertEqual(features["negative_sentiment"], 0.1)
        self.assertEqual(features["emotion_density"], 0.6)

    def test_multi_target_fitting_and_serialization(self):
        predictor = RetentionPredictor()
        
        with tempfile.TemporaryDirectory() as tmpdir:
            # Fit all models
            predictor.train_pipeline(tmpdir)
            
            # Verify serialized JSON files exist
            model_files = ["watch_time_model.json", "completion_rate_model.json", "replay_rate_model.json", "scroll_stop_rate_model.json"]
            for mf in model_files:
                self.assertTrue(os.path.exists(os.path.join(tmpdir, mf)))
                
            # Create a new predictor and load models
            new_predictor = RetentionPredictor()
            new_predictor.load_models(tmpdir)
            
            # Predict sample
            sample_features = {
                "pitch_variation": 0.5, "silence_ratio": 0.1, "volume_peaks": 0.4,
                "face_ratio": 0.6, "motion_variance": 0.3, "brightness": 0.5,
                "hook_strength": 0.5, "word_complexity": 0.4, "sentiment_polarity": 0.6,
                "positive_sentiment": 0.5, "negative_sentiment": 0.2, "emotion_density": 0.4
            }
            
            preds = new_predictor.predict_all(sample_features)
            
            self.assertIn("watch_time_sec", preds)
            self.assertIn("completion_rate", preds)
            self.assertIn("replay_rate", preds)
            self.assertIn("scroll_stop_rate", preds)
            
            # Verify outputs are bounded correctly
            self.assertTrue(0.0 <= preds["watch_time_sec"] <= 60.0)
            self.assertTrue(0.0 <= preds["completion_rate"] <= 1.0)
            self.assertTrue(0.0 <= preds["replay_rate"] <= 1.0)
            self.assertTrue(0.0 <= preds["scroll_stop_rate"] <= 1.0)

if __name__ == "__main__":
    unittest.main()
