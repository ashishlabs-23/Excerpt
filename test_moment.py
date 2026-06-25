import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from moment_engine import GoldenMomentEngine

class TestGoldenMomentEngine(unittest.TestCase):
    def test_laughter_and_reveal_scoring(self):
        engine = GoldenMomentEngine()
        
        # Test 1: High laughter keyword and reveal trigger
        transcript = "Haha introducing the finally revealed unboxing, this is so funny!"
        audio = {"volume_transient": 0.1, "applause": 0.0, "volume_peak": 0.2}
        visual = {"motion_transient": 0.1}
        emotion = {"positive_sentiment": 0.4, "negative_sentiment": 0.1}
        
        score_data = engine.calculate_moment_score(transcript, audio, visual, emotion)
        
        self.assertGreater(score_data["golden_moment_score"], 0.0)
        self.assertLessEqual(score_data["golden_moment_score"], 1.0)
        
        breakdown = score_data["breakdown"]
        self.assertGreater(breakdown["laughter"], 0.0)
        self.assertGreater(breakdown["reveal"], 0.0)

    def test_controversy_and_surprise_scoring(self):
        engine = GoldenMomentEngine()
        
        # Test 2: Argument words, negative sentiment, and motion transients (surprise)
        transcript = "That is completely wrong! I disagree, that is a scam."
        audio = {"volume_transient": 0.8, "applause": 0.0, "volume_peak": 0.6}
        visual = {"motion_transient": 0.9}  # Surprise motion transient
        emotion = {"positive_sentiment": 0.0, "negative_sentiment": 0.85}
        
        score_data = engine.calculate_moment_score(transcript, audio, visual, emotion)
        
        breakdown = score_data["breakdown"]
        self.assertGreater(breakdown["controversy"], 0.5)
        self.assertGreater(breakdown["surprise"], 0.8)

    def test_process_timeline_clipping(self):
        engine = GoldenMomentEngine()
        segments = [
            {
                "id": "seg_normal", "start": 0.0, "end": 10.0, "text": "This is a quiet, normal conversation.",
                "audio": {}, "visual": {}, "emotion": {}
            },
            {
                "id": "seg_viral", "start": 10.0, "end": 20.0, "text": "Unbelievable [laughter]! Introducing the winner!",
                "audio": {"volume_transient": 0.9, "applause": 0.8}, "visual": {"motion_transient": 0.8}, "emotion": {"positive_sentiment": 0.9}
            }
        ]
        
        results = engine.process_timeline(segments, threshold=0.70)
        
        self.assertEqual(len(results), 2)
        # Viral segment should be sorted first
        self.assertEqual(results[0]["id"], "seg_viral")
        self.assertTrue(results[0]["is_golden_moment"])
        
        # Normal segment should NOT be a golden moment
        self.assertEqual(results[1]["id"], "seg_normal")
        self.assertFalse(results[1]["is_golden_moment"])

if __name__ == "__main__":
    unittest.main()
