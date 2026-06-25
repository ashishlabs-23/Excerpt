import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from predictive_crop_engine import AccelerationKalmanFilter, PredictiveCropEngine

class TestPredictiveCropEngine(unittest.TestCase):
    def test_kalman_kinematics(self):
        kf = AccelerationKalmanFilter()
        measurement = np.array([100.0, 100.0])
        kf.initiate(measurement)
        
        self.assertEqual(kf.mean[0], 100.0)
        self.assertEqual(kf.mean[1], 100.0)
        
        # Predict transition
        kf.predict()
        # With default velocity 0, position should remain at 100
        self.assertEqual(kf.mean[0], 100.0)

    def test_trajectory_lookahead_lead(self):
        # We simulate a target moving linearly to the right (x increases by 0.05 per frame)
        engine = PredictiveCropEngine(default_lookahead=10)
        
        # Feed 5 frames of observations
        px_history = [0.1, 0.15, 0.2, 0.25, 0.3]
        
        for idx, x in enumerate(px_history):
            bbox = [x - 0.05, 0.45, x + 0.05, 0.55]
            pred_data = engine.predict_track_position(track_id=1, bbox=bbox, frame_idx=idx)
            
        # At final frame, target position is at x=0.3. Velocity is approx 0.05/frame.
        # With look-ahead = 10, the predicted center should lead the target position:
        # Expected x: 0.3 + 10 * 0.05 = 0.8
        self.assertGreater(pred_data["predicted_center"][0], 0.70)
        self.assertLessEqual(pred_data["predicted_center"][0], 1.0)
        
        # Bbox should remain clamped within video boundary bounds
        self.assertLessEqual(pred_data["predicted_bbox"][2], 1.0)

if __name__ == "__main__":
    unittest.main()
