import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from sports_engine import SportsIntelligenceEngine

class TestSportsIntelligenceEngine(unittest.TestCase):
    def test_scoreboard_heuristic(self):
        engine = SportsIntelligenceEngine(width=1920, height=1080)
        tracks = [
            # screen at ymin 0.05, occupying 5% area -> Scoreboard
            {"track_id": 1, "category": "screen", "bbox": [0.05, 0.05, 0.20, 0.15]}
        ]
        classified = engine.classify_roles(tracks)
        self.assertIsNotNone(classified["scoreboard"])
        self.assertEqual(classified["scoreboard"]["track_id"], 1)

    def test_goal_and_celebration_state_transitions(self):
        engine = SportsIntelligenceEngine(width=1000, height=1000)
        
        # 1. Frame 1: Action (Ball is in the middle of field)
        tracks_f1 = [
            {"track_id": 1, "category": "sports ball", "bbox": [0.45, 0.45, 0.47, 0.47]}
        ]
        classified_f1 = engine.classify_roles(tracks_f1)
        state_f1 = engine.detect_event_state(classified_f1, frame_idx=0)
        self.assertEqual(state_f1, "Action")

        # 2. Frame 2: Goal (Ball crosses endline at x < 0.08, moving very slowly/stopped)
        tracks_f2 = [
            {"track_id": 1, "category": "sports ball", "bbox": [0.02, 0.48, 0.04, 0.52], "velocity": [0.0, 0.0]}
        ]
        classified_f2 = engine.classify_roles(tracks_f2)
        state_f2 = engine.detect_event_state(classified_f2, frame_idx=1)
        self.assertEqual(state_f2, "Goal")

        # 3. Frame 3: Celebration (Goal is active, and multiple players cluster closely)
        tracks_f3 = [
            {"track_id": 2, "category": "person", "bbox": [0.20, 0.20, 0.30, 0.50]},
            {"track_id": 3, "category": "person", "bbox": [0.21, 0.20, 0.31, 0.50]},
            {"track_id": 4, "category": "person", "bbox": [0.22, 0.21, 0.32, 0.51]}
        ]
        classified_f3 = engine.classify_roles(tracks_f3)
        state_f3 = engine.detect_event_state(classified_f3, frame_idx=2)
        self.assertEqual(state_f3, "Celebration")

    def test_dynamic_zoom_by_state(self):
        engine = SportsIntelligenceEngine(width=1000, height=1000)
        
        # Under Celebration, it zooms in (crop height should be smaller than standard Action crop height)
        tracks = [
            {"track_id": 2, "category": "person", "bbox": [0.2, 0.2, 0.3, 0.5]}
        ]
        classified = engine.classify_roles(tracks)
        
        crop_action = engine.calculate_crop(classified, state="Action")
        crop_celebration = engine.calculate_crop(classified, state="Celebration")
        
        # Celebration zoom is closer, therefore crop height is smaller
        self.assertLess(crop_celebration["h"], crop_action["h"])

if __name__ == "__main__":
    unittest.main()
