import sys
import os
import unittest
import json
import numpy as np

sys.path.append("apps/api/scripts")
from virality_engine import CustomGBDTRegressor, ViralityPredictor

class TestViralityEngine(unittest.TestCase):
    def test_feature_extraction(self):
        predictor = ViralityPredictor()
        
        # Scenario: High curiosity, high emotion, good pace, high motion
        text = "WHAT is the SECRET of this AMAZING hack?"
        words = [
            {"word": "WHAT", "start": 0.0, "end": 0.5},
            {"word": "is", "start": 0.5, "end": 0.8},
            {"word": "the", "start": 0.8, "end": 1.0},
            {"word": "SECRET", "start": 1.0, "end": 1.5},
            {"word": "of", "start": 1.5, "end": 1.7},
            {"word": "this", "start": 1.7, "end": 2.0},
            {"word": "AMAZING", "start": 2.0, "end": 2.5},
            {"word": "hack", "start": 2.5, "end": 3.0}
        ]
        # 8 words in 3 seconds = 160 WPM (perfect pace)
        
        motion_events = [
            {"velocity": [0.01, 0.01]},
            {"velocity": [0.08, 0.08]},  # Sudden motion spike
            {"velocity": [0.01, 0.02]}
        ]
        
        features = predictor.extract_features(text, words, motion_events)
        
        self.assertGreater(features["curiosity"], 0.0)
        self.assertGreater(features["emotion"], 0.0)
        self.assertGreater(features["speaking_pace"], 0.0)
        self.assertGreater(features["surprise"], 0.0)
        self.assertGreater(features["motion_intensity"], 0.0)

    def test_gbdt_fitting_and_serialization(self):
        # 1. Train model
        np.random.seed(42)
        X = np.random.uniform(0.1, 1.0, (50, 5))
        y = 50.0 + 30.0 * X[:, 0] - 10.0 * X[:, 1]
        
        regressor = CustomGBDTRegressor(n_estimators=5, learning_rate=0.1, max_depth=3)
        regressor.fit(X, y)
        
        preds_1 = regressor.predict(X)
        residuals_mean_1 = np.mean(np.abs(y - preds_1))
        
        # Baseline residual mean of predicting constant mean
        base_residuals_mean = np.mean(np.abs(y - np.mean(y)))
        # Verify residuals decrease after fitting
        self.assertLess(residuals_mean_1, base_residuals_mean)
        
        # 2. Serialize to JSON and reload
        model_json = regressor.to_json()
        
        regressor_loaded = CustomGBDTRegressor()
        regressor_loaded.load_json(model_json)
        
        preds_2 = regressor_loaded.predict(X)
        np.testing.assert_array_almost_equal(preds_1, preds_2)

if __name__ == "__main__":
    unittest.main()
