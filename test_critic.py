import sys
import unittest

sys.path.append("apps/api/scripts")
from critic_engine import CriticEngine

class TestCriticEngine(unittest.TestCase):
    def test_high_quality_clip(self):
        engine = CriticEngine(threshold=70)
        
        # Build payload representing perfect reframing, stable tracks, and clear storytelling
        payload = {
            "crops": [
                {"x": 0.2, "y": 0.2, "w": 0.5, "h": 0.5},
                {"x": 0.2, "y": 0.2, "w": 0.5, "h": 0.5}
            ],
            "tracks": [
                {"tracks": [{"category": "person", "track_id": 1, "bbox": [0.3, 0.3, 0.4, 0.4]}]},
                {"tracks": [{"category": "person", "track_id": 1, "bbox": [0.31, 0.31, 0.41, 0.41]}]}
            ],
            "captions": [
                {"text": "Short caption line.", "confidence": 0.95}
            ],
            "story_arc": [
                {"stage": "Setup"},
                {"stage": "Climax"},
                {"stage": "Payoff"}
            ],
            "retention": {
                "completion_rate": 0.85
            },
            "emotions": [
                {"confidence": 0.9, "primary_emotion": "excitement"}
            ]
        }
        
        res = engine.evaluate_clip(payload)
        
        self.assertFalse(res["regenerate"])
        self.assertGreaterEqual(res["score"], 80)
        self.assertEqual(len(res["issues"]), 0)

    def test_low_quality_clip_triggers_regeneration(self):
        engine = CriticEngine(threshold=75)
        
        # Build payload with subject clipping, choppy tracking jump, and missing climax phase
        payload = {
            "crops": [
                {"x": 0.4, "y": 0.2, "w": 0.3, "h": 0.5},
                {"x": 0.4, "y": 0.2, "w": 0.3, "h": 0.5}
            ],
            "tracks": [
                # Subject 1 is clipped on horizontal axis (cx=0.4, x1=0.3)
                {"tracks": [{"category": "person", "track_id": 1, "bbox": [0.3, 0.3, 0.38, 0.4]}]},
                # Tracking jumps from xcenter=0.34 to xcenter=0.74 (delta=0.40 > 0.20 threshold)
                {"tracks": [{"category": "person", "track_id": 1, "bbox": [0.7, 0.3, 0.78, 0.4]}]}
            ],
            "captions": [
                {"text": "This is a very long caption that has way too many words per line.", "confidence": 0.95}
            ],
            "story_arc": [
                {"stage": "Setup"},
                {"stage": "Setup"} # Missing Climax and Payoff!
            ],
            "retention": {
                "completion_rate": 0.35
            },
            "emotions": [
                {"confidence": 0.95, "primary_emotion": "shock"}
            ]
        }
        
        res = engine.evaluate_clip(payload)
        
        self.assertTrue(res["regenerate"])
        self.assertLess(res["score"], 75)
        self.assertTrue(len(res["issues"]) > 0)
        self.assertIn("Clip lacks a narrative Climax phase", res["issues"])
        self.assertIn("Subject clipped by reframing boundary", res["issues"])

if __name__ == "__main__":
    unittest.main()
