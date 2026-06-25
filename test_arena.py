import sys
import unittest

sys.path.append("apps/api/scripts")
from excerpt_arena import ExcerptArena

class TestExcerptArena(unittest.TestCase):
    def test_elo_updates_correctly(self):
        arena = ExcerptArena(k_factor=32)
        
        # Initial ratings: baseline=1000, quality=1000
        # If quality wins (outcome=1.0)
        arena.update_ratings("quality", "baseline", 1.0)
        
        # Quality rating should increase, baseline should decrease
        self.assertGreater(arena.ratings["quality"], 1000.0)
        self.assertLess(arena.ratings["baseline"], 1000.0)
        
        # Match expected outcomes sum to 1.0
        e_orch = arena.compute_expected_score(arena.ratings["quality"], arena.ratings["baseline"])
        e_base = arena.compute_expected_score(arena.ratings["baseline"], arena.ratings["quality"])
        self.assertAlmostEqual(e_orch + e_base, 1.0, places=4)

    def test_tournament_ranking_orders(self):
        import numpy as np
        np.random.seed(42)
        arena = ExcerptArena()
        
        # Build 5 dataset test cases where quality scores are always superior
        datasets = []
        for i in range(5):
            datasets.append({
                "baseline": {"crops_score": 40.0, "captions_score": 45.0, "story_score": 30.0, "retention_score": 30.0, "generation_time": 30.0, "cost": 0.01},
                "draft": {"crops_score": 60.0, "captions_score": 65.0, "story_score": 70.0, "retention_score": 60.0, "generation_time": 45.0, "cost": 0.02},
                "quality": {"crops_score": 90.0, "captions_score": 95.0, "story_score": 90.0, "retention_score": 90.0, "generation_time": 120.0, "cost": 0.10},
                "opus": {"crops_score": 85.0, "captions_score": 85.0, "story_score": 80.0, "retention_score": 80.0, "generation_time": 180.0, "cost": 0.15}
            })
            
        arena.run_matchups(datasets)
        report = arena.generate_report()
        
        # Quality rating must exceed draft, and draft must exceed baseline
        self.assertGreater(arena.ratings["quality"], arena.ratings["draft"])
        self.assertGreater(arena.ratings["draft"], arena.ratings["baseline"])
        self.assertEqual(report["averages"]["quality"], 91.25)
        self.assertIn("Excerpt Quality mode outperforms competitors", report["recommendations"][0])

if __name__ == "__main__":
    unittest.main()
