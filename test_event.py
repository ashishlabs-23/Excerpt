import sys
import unittest

sys.path.append("apps/api/scripts")
from event_engine import MultimodalEventEngine

class TestMultimodalEventEngine(unittest.TestCase):
    def test_football_goal_detection(self):
        engine = MultimodalEventEngine(sport="football")
        
        # Frame 0: setup path
        frame_idx = 0
        audio = {"db": 60.0}
        motion = {"magnitude": 0.01}
        tracking = []
        ball_data = {
            "ball_position": [0.90, 0.50],
            "events": {"anticipated_goal": True}
        }
        res1 = engine.process_frame(frame_idx, audio, motion, tracking, ball_data)
        
        # Frame 1: ball enters goal with audio loudness spike
        audio2 = {"db": 85.0, "spectral_flux": 2.0}
        ball_data2 = {
            "ball_position": [0.97, 0.50],
            "events": {"anticipated_goal": True}
        }
        res2 = engine.process_frame(1, audio2, motion, tracking, ball_data2)
        
        self.assertEqual(res2["event"], "goal")
        self.assertGreater(res2["confidence"], 0.90)

    def test_football_dribble_detection(self):
        engine = MultimodalEventEngine(sport="football")
        
        # Simulates 15 frames where player and ball are close
        for f in range(15):
            tracking = [{"track_id": 4, "category": "person", "bbox": [0.4, 0.4, 0.44, 0.44]}]
            ball_data = {"ball_position": [0.42, 0.42]}
            res = engine.process_frame(f, {}, {}, tracking, ball_data)
            
        self.assertEqual(res["event"], "dribble")
        self.assertGreater(res["confidence"], 0.60)

    def test_basketball_dunk_detection(self):
        engine = MultimodalEventEngine(sport="basketball")
        
        # Setup history
        engine.process_frame(0, {}, {}, [], {"ball_position": [0.1, 0.31]})
        
        # Hoop is at [0.1, 0.35]. Player bbox near hoop. Downward velocity (vy > 0.02)
        tracking = [{"track_id": 1, "category": "person", "bbox": [0.08, 0.30, 0.12, 0.45]}]
        ball_data = {"ball_position": [0.1, 0.34]}
        res = engine.process_frame(1, {}, {}, tracking, ball_data)
        
        self.assertEqual(res["event"], "dunk")
        self.assertGreater(res["confidence"], 0.90)

if __name__ == "__main__":
    unittest.main()
