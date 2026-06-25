import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from attention_engine import HumanAttentionEngine

class TestHumanAttentionEngine(unittest.TestCase):
    def test_center_bias_only(self):
        # When no tracks exist, only center bias is active, so center (0.5, 0.5) should be primary focus
        engine = HumanAttentionEngine(grid_size=11)
        res = engine.calculate_attention(tracks=[])
        
        self.assertEqual(res["primary_focus"]["x"], 0.5)
        self.assertEqual(res["primary_focus"]["y"], 0.5)
        self.assertEqual(res["primary_focus"]["score"], 1.0)
        
        # Verify heatmap size matches grid size
        self.assertEqual(len(res["attention_heatmap"]), 11)
        self.assertEqual(len(res["attention_heatmap"][0]), 11)

    def test_face_saliency_focus(self):
        # When a face is on the left side, primary focus should shift towards it
        engine = HumanAttentionEngine(grid_size=11, weights={"face": 0.8, "motion": 0.0, "semantic": 0.0, "bias": 0.2})
        tracks = [
            {"track_id": 1, "category": "face", "bbox": [0.1, 0.4, 0.3, 0.6], "confidence": 1.0}
        ]
        res = engine.calculate_attention(tracks)
        
        # Left side face center is at x=0.2, y=0.5
        self.assertLess(res["primary_focus"]["x"], 0.4) # Shifted to left
        self.assertAlmostEqual(res["primary_focus"]["y"], 0.5, places=1)

    def test_temporal_smoothing_and_saccades(self):
        engine = HumanAttentionEngine(grid_size=11, alpha=0.20, saccade_threshold=0.40)
        
        # Frame 1: Center focus
        tracks_f1 = [{"track_id": 1, "category": "face", "bbox": [0.4, 0.4, 0.6, 0.6]}]
        res_f1 = engine.calculate_attention(tracks_f1)
        self.assertEqual(res_f1["primary_focus"]["x"], 0.5)
        
        # Frame 2: Minor shift to right (center at 0.6, within saccade threshold)
        tracks_f2 = [{"track_id": 1, "category": "face", "bbox": [0.5, 0.4, 0.7, 0.6]}]
        res_f2 = engine.calculate_attention(tracks_f2)
        # Expected smoothed x: 0.20 * 0.6 + 0.80 * 0.5 = 0.52
        self.assertAlmostEqual(res_f2["primary_focus"]["x"], 0.52, places=2)
        
        # Frame 3: Massive jump to far left (center at 0.1, exceeding 0.40 saccade threshold)
        tracks_f3 = [{"track_id": 1, "category": "face", "bbox": [0.0, 0.4, 0.2, 0.6]}]
        res_f3 = engine.calculate_attention(tracks_f3)
        # Saccade snap should trigger, resulting in instant snap to 0.1 instead of slow panning
        self.assertEqual(res_f3["primary_focus"]["x"], 0.1)

if __name__ == "__main__":
    unittest.main()
