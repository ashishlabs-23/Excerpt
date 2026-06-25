import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from ball_intelligence_engine import BallTrajectoryEngine

class TestBallTrajectoryEngine(unittest.TestCase):
    def test_ball_trajectory_physics(self):
        engine = BallTrajectoryEngine(sport="basketball")
        # Initialize ball tracking
        ball = {"bbox": [0.45, 0.45, 0.47, 0.47]}
        
        # Frame 1
        res1 = engine.process_frame(ball, players=[], frame_idx=0)
        self.assertEqual(res1["ball_position"], [0.46, 0.46])
        
        # Frame 2: Ball starts moving upward (vy negative)
        ball_f2 = {"bbox": [0.45, 0.35, 0.47, 0.37]}
        res2 = engine.process_frame(ball_f2, players=[], frame_idx=1)
        
        # Predicted path should follow parabolic curve (y increases due to gravity)
        self.assertTrue(len(res2["predicted_path"]) == 15)
        # Check gravity pull makes y coordinate increase compared to raw linear extrapolation
        linear_y = 0.36 + 15 * (0.36 - 0.46)  # y_curr + 15 * vy = 0.36 + 15 * (-0.1) = -1.14 (out of bounds)
        # Saliency clamping is active, but the predicted path y is pulled downwards compared to linear
        self.assertGreater(res2["predicted_path"][-1][1], 0.0)

    def test_impact_direction_change(self):
        engine = BallTrajectoryEngine(sport="football")
        
        # Feed linear velocity to the right: dx=0.1, dy=0.0
        engine.process_frame({"bbox": [0.1, 0.5, 0.12, 0.52]}, players=[], frame_idx=0)
        engine.process_frame({"bbox": [0.2, 0.5, 0.22, 0.52]}, players=[], frame_idx=1)
        
        # Frame 3: Sudden bounce/direction change: dx=0.0, dy=-0.1 (90 degrees angle change)
        res = engine.process_frame({"bbox": [0.2, 0.4, 0.22, 0.42]}, players=[], frame_idx=2)
        
        self.assertTrue(res["events"]["impact"])
        self.assertEqual(res["events"]["impact_type"], "bounce/direction_change")
        self.assertEqual(res["importance_score"], 0.95)

    def test_pass_and_goal_anticipation(self):
        engine = BallTrajectoryEngine(sport="football")
        
        # Ball moving right towards goal post area (final step projected near x=0.95, y=0.5)
        engine.process_frame({"bbox": [0.5, 0.5, 0.52, 0.52]}, players=[], frame_idx=0)
        
        # Players at target location
        players = [
            {"track_id": 2, "category": "person", "bbox": [0.75, 0.3, 0.85, 0.6]}
        ]
        
        # Ball is moving right at vx = 0.034, vy = -0.03
        res = engine.process_frame({"bbox": [0.534, 0.47, 0.554, 0.49]}, players=players, frame_idx=1)
        
        self.assertTrue(res["events"]["anticipated_pass"])
        self.assertTrue(res["events"]["anticipated_shot"])
        self.assertGreater(res["importance_score"], 0.90)

if __name__ == "__main__":
    unittest.main()
