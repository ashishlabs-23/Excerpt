import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from subject_priority_engine import SubjectPriorityEngine

class TestSubjectPriorityEngine(unittest.TestCase):
    def test_associate_faces_with_tracks(self):
        engine = SubjectPriorityEngine()
        tracks = [
            {"track_id": 1, "category": "person", "bbox": [0.1, 0.1, 0.4, 0.8]},
            {"track_id": 2, "category": "face", "bbox": [0.2, 0.15, 0.3, 0.3]},
            {"track_id": 3, "category": "face", "bbox": [0.7, 0.7, 0.8, 0.8]} # Face outside person
        ]
        associations = engine._associate_faces_with_tracks(tracks)
        
        self.assertIn(1, associations)
        self.assertEqual(associations[1]["track_id"], 2)

    def test_calculate_priority_scoring(self):
        engine = SubjectPriorityEngine()
        
        # We simulate frame tracking: Track 1 (person), Track 2 (face inside person)
        tracks = [
            {"track_id": 1, "category": "person", "bbox": [0.4, 0.2, 0.6, 0.8], "velocity": [0.05, 0.02], "confidence": 0.95},
            {"track_id": 2, "category": "face", "bbox": [0.45, 0.25, 0.55, 0.45], "confidence": 0.90}
        ]
        
        # 1. Update dynamic speaker votes (Track 1 is closest to center while speaker A is active)
        priorities = engine.calculate_priority(tracks, active_speaker="A")
        
        self.assertEqual(len(priorities), 1)  # Only person is returned, face is associated
        res = priorities[0]
        self.assertEqual(res["track_id"], 1)
        self.assertGreater(res["priority_score"], 0.0)
        self.assertLessEqual(res["priority_score"], 1.0)
        
        breakdown = res["breakdown"]
        self.assertGreater(breakdown["face_size"], 0.0)
        self.assertEqual(breakdown["speaking"], 1.0)  # speaking is active and track voted
        self.assertGreater(breakdown["motion"], 0.0)
        self.assertGreater(breakdown["position"], 0.0)

    def test_visual_importance_categories(self):
        engine = SubjectPriorityEngine()
        tracks_person = [{"track_id": 1, "category": "person", "bbox": [0.4, 0.4, 0.6, 0.6], "confidence": 1.0}]
        tracks_phone = [{"track_id": 2, "category": "phone", "bbox": [0.4, 0.4, 0.6, 0.6], "confidence": 1.0}]
        
        p_person = engine.calculate_priority(tracks_person, active_speaker=None)
        p_phone = engine.calculate_priority(tracks_phone, active_speaker=None)
        
        # Person should have higher priority score than phone due to category importance weight
        self.assertGreater(p_person[0]["priority_score"], p_phone[0]["priority_score"])

if __name__ == "__main__":
    unittest.main()
