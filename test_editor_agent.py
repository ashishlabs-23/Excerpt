import sys
import os
import unittest
import json
import shutil

sys.path.append("apps/api/scripts")
from editor_agent import ExcerptEditorAgent
from preference_logger import ExcerptPreferenceLogger

class TestEditorAgentAndPreferenceLogger(unittest.TestCase):
    def setUp(self):
        self.temp_dir = "temp_test_logs"
        os.makedirs(self.temp_dir, exist_ok=True)

    def tearDown(self):
        if os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def test_editor_agent_candidate_plans(self):
        agent = ExcerptEditorAgent(target_platform="tiktok", video_type="football")
        
        # Build 10 frames timeline
        timeline = []
        for f in range(10):
            timeline.append({
                "timestamp": f * 1.0,
                "story_stage": "CLIMAX" if f == 5 else "SETUP",
                "events": ["goal"] if f == 5 else [],
                "emotion": {"excitement": 0.9 if f == 5 else 0.1}
            })
            
        plans = agent.generate_candidate_plans(timeline)
        
        # We expect 20 candidate plans (emotion_first, story_first, action_first)
        self.assertEqual(len(plans), 20)
        self.assertTrue(all(p["score"] > 0 for p in plans))
        
        # Plan 0 (best score) checks
        best_plan = plans[0]
        self.assertIn(best_plan["strategy"], ["emotion_first", "story_first", "action_first"])
        self.assertEqual(best_plan["intent"], f"maximize_viewer_{best_plan['strategy']}")
        
        # Intent and policy sequence checks
        self.assertEqual(best_plan["reasoning"]["policy_applied"], "football_goal")
        # Start and end boundaries check
        self.assertEqual(best_plan["clip_start"], 5.0)
        self.assertEqual(best_plan["clip_end"], 10.0)

    def test_preference_and_telemetry_logger(self):
        logger = ExcerptPreferenceLogger(output_dir=self.temp_dir)
        
        matchup_data = {
            "video_type": "football",
            "platform": "tiktok",
            "clip_duration": 32.5,
            "caption_style": "neon",
            "editor_strategy": "emotion_first",
            "winner_clip_id": "clip_A",
            "loser_clip_id": "clip_B",
            "winner_reason": "better_pacing",
            "editor_user_id": "editor_1",
            "chosen_features": {"avg_emotion": 0.9},
            "rejected_features": {"avg_emotion": 0.4}
        }
        
        matchup_uuid = logger.log_preference_matchup(matchup_data)
        
        # Check files exist
        pref_file = os.path.join(self.temp_dir, f"preference_{matchup_uuid}.json")
        reward_file = os.path.join(self.temp_dir, f"reward_{matchup_uuid}.json")
        self.assertTrue(os.path.exists(pref_file))
        self.assertTrue(os.path.exists(reward_file))
        
        # Validate logged data
        with open(pref_file, "r") as f:
            log = json.load(f)
        self.assertEqual(log["winner_reason"], "better_pacing")
        self.assertEqual(log["editor_strategy"], "emotion_first")

        # Telemetry check
        telemetry_data = {
            "render_time_ms": 1450,
            "gpu_memory_used_mb": 2048,
            "failure_rate": 0.0,
            "crop_repair_count": 1,
            "caption_repair_count": 0,
            "critic_score": 88.5,
            "candidate_count": 5
        }
        job_uuid = logger.log_telemetry(telemetry_data)
        telemetry_file = os.path.join(self.temp_dir, f"telemetry_{job_uuid}.json")
        self.assertTrue(os.path.exists(telemetry_file))

if __name__ == "__main__":
    unittest.main()
