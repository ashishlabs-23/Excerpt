import sys
import unittest

sys.path.append("apps/api/scripts")
from replay_detection_engine import ReplayDetectionEngine

class TestReplayDetectionEngine(unittest.TestCase):
    def test_slow_motion_and_logo_transition(self):
        engine = ReplayDetectionEngine(fps=10) # Using 10 FPS for test speed
        
        # Build a timeline of 60 frames (6 seconds)
        # Normal speed first (0.02 delta per frame)
        timeline = []
        for i in range(20):
            x = 0.1 + i * 0.02
            timeline.append({
                "timestamp": i * 0.1,
                "tracking": [{"category": "sports ball", "bbox": [x, 0.5, x+0.02, 0.52]}],
                "visual": {"logo_overlay_detected": False},
                "motion": {"magnitude": 0.01}
            })
            
        # Transition wipe logo trigger at frame 20
        timeline.append({
            "timestamp": 2.0,
            "tracking": [],
            "visual": {"logo_overlay_detected": True},
            "motion": {"magnitude": 0.02}
        })
        
        # Slow motion replay section from frame 21 to 50 (3 seconds)
        # Slow speed (0.005 delta per frame - 25% of baseline speed)
        for i in range(21, 50):
            x = 0.5 + (i - 20) * 0.005
            timeline.append({
                "timestamp": i * 0.1,
                "tracking": [{"category": "sports ball", "bbox": [x, 0.5, x+0.02, 0.52]}],
                "visual": {"logo_overlay_detected": False},
                "motion": {"magnitude": 0.01}
            })
            
        # Normal speed again to frame 60
        for i in range(50, 60):
            x = 0.7 + (i - 50) * 0.02
            timeline.append({
                "timestamp": i * 0.1,
                "tracking": [{"category": "sports ball", "bbox": [x, 0.5, x+0.02, 0.52]}],
                "visual": {"logo_overlay_detected": False},
                "motion": {"magnitude": 0.01}
            })

        replays = engine.process_timeline(timeline)
        
        self.assertTrue(len(replays) > 0)
        self.assertTrue(replays[0]["replay"])
        # The replay start should be around the transition wipe logo area (2.0s)
        self.assertLessEqual(replays[0]["start"], 2.2)
        # Replay should end near the end of slow motion region (5.0s)
        self.assertGreaterEqual(replays[0]["end"], 4.8)

if __name__ == "__main__":
    unittest.main()
