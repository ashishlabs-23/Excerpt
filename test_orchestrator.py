import sys
import unittest

sys.path.append("apps/api/scripts")
from excerpt_intelligence_orchestrator import ExcerptIntelligenceOrchestrator

class TestExcerptOrchestrator(unittest.TestCase):
    def test_tiered_selection_and_world_model_updates(self):
        orchestrator = ExcerptIntelligenceOrchestrator(platform="tiktok", target_sport="football")
        
        # Simulate 10 frames
        # Frame 5 is a peak moment (high audio energy and motion)
        raw_frames = []
        for f in range(10):
            is_peak = (f == 5)
            raw_frames.append({
                "speech_detected": True,
                "words_count": 3,
                "tracks": [{"category": "person", "bbox": [0.1, 0.1, 0.2, 0.2]}],
                "audio_energy": 0.9 if is_peak else 0.1,
                "motion_magnitude": 0.08 if is_peak else 0.01,
                "curiosity_score": 0.8 if is_peak else 0.1
            })
            
        results = orchestrator.execute_pipeline(raw_frames)
        
        self.assertEqual(results["status"], "success")
        
        # Ensure world model is updated based on peak moment climax events
        self.assertEqual(orchestrator.world_model["story_phase"], "climax")
        self.assertEqual(orchestrator.world_model["current_state"], "attack")
        
        # Temporal memory check
        self.assertEqual(orchestrator.temporal_memory["last_event"], "goal")
        self.assertEqual(orchestrator.temporal_memory["last_story_phase"], "climax")
        
        # Ensure only the peak frame (index 5) is marked as a candidate
        plan = results["render_plan"]
        self.assertEqual(len(plan["crops"]), 10)
        self.assertEqual(plan["crops"][5]["zoom_factor"], 1.6) # aggressive zoom policy
        
    def test_multi_critic_and_repair_loop(self):
        # Initialize orchestrator with shorts platform policy
        orchestrator = ExcerptIntelligenceOrchestrator(platform="shorts", target_sport="football")
        
        # Build raw frames that lack energy (climax missing)
        raw_frames = []
        for f in range(10):
            raw_frames.append({
                "speech_detected": True,
                "words_count": 2,
                "tracks": [],
                "audio_energy": 0.1,
                "motion_magnitude": 0.01,
                "curiosity_score": 0.1
            })
            
        # Run pipeline - this should trigger story critic failure due to missing climax
        results = orchestrator.execute_pipeline(raw_frames)
        
        # Confirm that the targeted repair strategies fixed the issues (story forced CLIMAX)
        # Therefore, final evaluation score must be higher/approved after repair
        self.assertFalse(results["evaluation"]["regenerate"])
        self.assertGreaterEqual(results["evaluation"]["score"], 70)

if __name__ == "__main__":
    unittest.main()
