import sys
import unittest

sys.path.append("apps/api/scripts")
from golden_moment_engine import GoldenMomentEngine

class TestGoldenMomentEngine(unittest.TestCase):
    def test_shock_and_crowd_eruption_ranking(self):
        engine = GoldenMomentEngine()
        
        # Setup 3 different timeline moments:
        # Segment 0: low intensity baseline
        seg0 = {
            "timestamp": 10.0,
            "speech": "The game continues into the second quarter.",
            "emotion": {"surprise": 0.1, "shock": 0.1, "joy": 0.2},
            "motion": {"magnitude": 0.01},
            "events": [],
            "attention": {"focus_density": 0.4},
            "audio_db": 60.0
        }
        
        # Segment 1: High shock climax (buzzer-beater shot, crowd eruption)
        seg1 = {
            "timestamp": 30.0,
            "speech": "Unbelievable! Watch this shot go in!",
            "emotion": {"surprise": 0.95, "shock": 0.9, "joy": 0.9},
            "motion": {"magnitude": 0.08},
            "events": ["crowd_reaction", "cheering"],
            "attention": {"focus_density": 0.8},
            "audio_db": 95.0
        }
        
        # Segment 2: medium laugh moment
        seg2 = {
            "timestamp": 50.0,
            "speech": "That was a funny joke, haha!",
            "emotion": {"laughter": 0.8, "joy": 0.7},
            "motion": {"magnitude": 0.02},
            "events": [],
            "attention": {"focus_density": 0.5},
            "audio_db": 75.0
        }

        timeline = [seg0, seg1, seg2]
        ranked = engine.process_timeline(timeline)
        
        # Verify 3 ranked elements
        self.assertEqual(len(ranked), 3)
        
        # Segment 1 must be ranked #1
        best_moment = ranked[0]
        self.assertEqual(best_moment["timestamp"], 30.0)
        self.assertGreater(best_moment["moment_score"], 50)
        
        # Breakdown checks
        self.assertGreater(best_moment["breakdown"]["shocks"], 0.7)
        self.assertGreater(best_moment["breakdown"]["crowd_eruptions"], 0.7)
        
        # Segment 0 must be ranked last (lowest score)
        self.assertEqual(ranked[2]["timestamp"], 10.0)

if __name__ == "__main__":
    unittest.main()
