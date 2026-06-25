import sys
import unittest

sys.path.append("apps/api/scripts")
from reward_model import ExcerptRewardModel
from preference_scheduler import ExcerptPreferenceScheduler

class TestRewardModelAndScheduler(unittest.TestCase):
    def test_reward_prediction_and_training(self):
        model = ExcerptRewardModel()
        
        # Test baseline prediction
        features = {
            "duration": 0.8,
            "caption_density": 0.6,
            "avg_zoom": 0.5,
            "speaker_changes": 0.4,
            "emotion_peak": 0.9,
            "motion_peak": 0.8,
            "story_completeness": 0.9,
            "hook_strength": 0.8
        }
        # Enrich context to trigger high confidence
        context = {
            "video_type": "football",
            "platform": "tiktok",
            "duration_bucket": "15-30s",
            "speaker_count": 1,
            "content_category": "sports",
            "editor_strategy": "emotion_first"
        }
        
        res = model.predict_reward(features, context)
        self.assertGreater(res["human_preference"], 0.5)
        self.assertEqual(res["confidence"], 0.85)
        self.assertIn("emotion", res["contributions"])
        
        # Simulate pairwise Bradley-Terry training
        samples = [
            {
                "chosen": {"emotion_peak": 0.9, "motion_peak": 0.8},
                "chosen_context": {"video_type": "football", "editor_strategy": "action_first"},
                "rejected": {"emotion_peak": 0.2, "motion_peak": 0.1},
                "rejected_context": {"video_type": "football", "editor_strategy": "story_first"}
            }
        ]
        # Initial emotion weight
        init_emo_w = model.weights["emotion_peak"]
        model.train_on_pairwise_samples(samples, learning_rate=1.0)
        
        # Emotion peak weight should have increased due to positive gradient updates
        self.assertGreaterEqual(model.weights["emotion_peak"], init_emo_w)

    def test_exploration_candidate_selection(self):
        model = ExcerptRewardModel()
        
        # Build 30 mock candidates
        candidates = []
        for i in range(30):
            candidates.append({
                "id": f"cand_{i}",
                "features": {
                    "duration": 0.5,
                    "caption_density": 0.5,
                    "avg_zoom": 0.5,
                    "speaker_changes": 0.5,
                    "emotion_peak": 0.9 if i == 29 else 0.1,
                    "motion_peak": 0.5,
                    "story_completeness": 0.5,
                    "hook_strength": 0.5
                }
            })
            
        selected = model.select_best_candidates(candidates, {"video_type": "football"})
        
        # Expected selection size is 20 (15 top by reward + 5 random)
        self.assertEqual(len(selected), 20)
        
        # Cand 29 (highest reward) must be in the selected top 15
        selected_ids = {c["id"] for c in selected}
        self.assertIn("cand_29", selected_ids)

    def test_multi_stage_search(self):
        model = ExcerptRewardModel()
        
        # Build 100 mock candidates for multi-stage search
        candidates = []
        for i in range(100):
            candidates.append({
                "id": f"cand_{i}",
                "features": {
                    "duration": 0.5,
                    "caption_density": 0.5,
                    "avg_zoom": 0.5,
                    "speaker_changes": 0.5,
                    "emotion_peak": 0.9 if i == 99 else 0.1,
                    "motion_peak": 0.5,
                    "story_completeness": 0.5,
                    "hook_strength": 0.5
                },
                "critic_score": 95.0 if i == 99 else 60.0
            })
            
        context = {
            "video_type": "football",
            "platform": "tiktok",
            "duration_bucket": "15-30s",
            "speaker_count": 1,
            "content_category": "sports",
            "editor_strategy": "action_first"
        }
        
        selected = model.multi_stage_search(candidates, context)
        
        # Multi-stage ends with Top 5 candidates
        self.assertEqual(len(selected), 5)
        
        # The best clip (99) has both high reward and high critic score, so it should be in the top 3 (arena)
        selected_ids = {c["id"] for c in selected}
        self.assertIn("cand_99", selected_ids)

    def test_preference_scheduler_triggers(self):
        scheduler = ExcerptPreferenceScheduler()
        
        # Case 1: Low Confidence trigger
        res1 = scheduler.evaluate_clip_for_human_vote(
            reward_prediction={"human_preference": 0.8, "confidence": 0.4},
            critic_score=80.0,
            context={"video_type": "football"}
        )
        self.assertTrue(res1["send_to_arena"])
        self.assertIn("Low reward model confidence", res1["reasons"])
        
        # Case 2: Score conflict/disagreement trigger (Critic=90, Reward=40)
        res2 = scheduler.evaluate_clip_for_human_vote(
            reward_prediction={"human_preference": 0.4, "confidence": 0.9},
            critic_score=90.0,
            context={"video_type": "football"}
        )
        self.assertTrue(res2["send_to_arena"])
        self.assertTrue(any("conflict" in r for r in res2["reasons"]))
        
        # Case 3: New category trigger
        res3 = scheduler.evaluate_clip_for_human_vote(
            reward_prediction={"human_preference": 0.8, "confidence": 0.9},
            critic_score=80.0,
            context={"video_type": "badminton"}
        )
        self.assertTrue(res3["send_to_arena"])
        self.assertTrue(any("badminton" in r for r in res3["reasons"]))

if __name__ == "__main__":
    unittest.main()
