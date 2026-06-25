import sys
import unittest

sys.path.append("apps/api/scripts")
from emotion_engine import EmotionEngine

class TestEmotionEngine(unittest.TestCase):
    def test_excitement_fusion(self):
        engine = EmotionEngine()
        
        # Simulating excitement cues: smile, high pitch variance, talking fast, cheering crowd
        face = {"smile_score": 0.9, "brow_raise": 0.2, "mouth_open": 0.4}
        voice = {"pitch_variance": 0.8, "db": 85.0, "speaking_pace": 0.9}
        crowd = {"cheering": 1.0, "applause": 0.8}
        
        res = engine.analyze_frame(frame_idx=0, timestamp=0.0, face_data=face, voice_data=voice, crowd_data=crowd)
        
        self.assertEqual(res["primary_emotion"], "excitement")
        self.assertGreater(res["emotions"]["excitement"], 0.70)
        self.assertGreater(res["confidence"], 0.70)

    def test_shock_fusion(self):
        engine = EmotionEngine()
        
        # Simulating shock: surprise brow raise, mouth wide open, loud gasp (vocal energy), low smile
        face = {"smile_score": 0.1, "brow_raise": 0.9, "mouth_open": 0.9}
        voice = {"pitch_variance": 0.4, "db": 95.0, "speaking_pace": 0.2}
        crowd = {"cheering": 0.2, "applause": 0.1}
        
        res = engine.analyze_frame(frame_idx=1, timestamp=0.1, face_data=face, voice_data=voice, crowd_data=crowd)
        
        self.assertEqual(res["primary_emotion"], "shock")
        self.assertGreater(res["emotions"]["shock"], 0.70)

if __name__ == "__main__":
    unittest.main()
