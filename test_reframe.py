import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from reframe_engine import SmartReframeEngine

class TestSmartReframeEngine(unittest.TestCase):
    def test_default_center_crop(self):
        engine = SmartReframeEngine(width=1920, height=1080)
        crop = engine.calculate_crop(priorities=[])
        
        # Verify 9:16 aspect ratio
        self.assertAlmostEqual(crop["w"] / crop["h"], 9.0 / 16.0, places=2)
        # Verify centering
        self.assertEqual(crop["cx"], 1920 / 2.0)
        self.assertEqual(crop["cy"], 1080 / 2.0)

    def test_crop_boundaries_clamping(self):
        engine = SmartReframeEngine(width=1920, height=1080)
        # Simulate track near the extreme left edge
        priorities = [{"track_id": 1, "bbox": [0.01, 0.4, 0.05, 0.6], "priority_score": 0.95}]
        
        crop = engine.calculate_crop(priorities)
        
        # Verify crop remains inside boundary: x >= 0
        self.assertGreaterEqual(crop["x"], 0)
        self.assertLessEqual(crop["x"] + crop["w"], 1920)

    def test_dead_zone_smoothing(self):
        engine = SmartReframeEngine(width=1000, height=1000, dead_zone=0.10) # dead zone = 100px
        
        # Frame 1: Center
        p1 = [{"track_id": 1, "bbox": [0.45, 0.45, 0.55, 0.55], "priority_score": 0.9}]
        c1 = engine.calculate_crop(p1)
        
        # Frame 2: Minor track movement (within 100px dead zone)
        # Move center from 500 to 520 (diff of 20px)
        p2 = [{"track_id": 1, "bbox": [0.47, 0.45, 0.57, 0.55], "priority_score": 0.9}]
        c2 = engine.calculate_crop(p2)
        
        # Center should not change due to dead zone
        self.assertEqual(c1["cx"], c2["cx"])

    def test_scene_cut_snapping(self):
        engine = SmartReframeEngine(width=1000, height=1000, scene_threshold=0.30) # threshold = 300px
        
        # Frame 1: Left side
        p1 = [{"track_id": 1, "bbox": [0.05, 0.45, 0.15, 0.55], "priority_score": 0.9}]
        c1 = engine.calculate_crop(p1)
        
        # Frame 2: Sudden jump to right side (center moves from 100 to 800 -> diff 700px)
        p2 = [{"track_id": 1, "bbox": [0.75, 0.45, 0.85, 0.55], "priority_score": 0.9}]
        c2 = engine.calculate_crop(p2)
        
        # Target center is 800px. With scene cut threshold of 300px, it should snap instantly
        self.assertEqual(c2["cx"], 800)

if __name__ == "__main__":
    unittest.main()
