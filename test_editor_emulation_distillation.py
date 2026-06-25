import sys
import unittest
import os

sys.path.append("apps/api/scripts")
from editor_persona_engine import EditorPersonaEngine
from editor_distillation_engine import EditorDistillationEngine
from match_importance_engine import MatchImportanceEngine
from player_importance_engine import PlayerImportanceEngine
from candidate_diversity_engine import CandidateDiversityEngine
from moment_boundary_optimizer import MomentBoundaryOptimizer
from football_director_engine import FootballDirectorEngine
from replay_story_engine import ReplayStoryEngine
from outcome_learning_engine import OutcomeLearningEngine
from retention_predictor_v3 import RetentionPredictorV3
from football_pattern_engine import FootballPatternEngine
from internal_arena_simulator import InternalArenaSimulator

class TestEditorEmulationAndDistillation(unittest.TestCase):
    def setUp(self):
        self.variant = {
            "start": 10.0,
            "end": 30.0,
            "story_type": "counterattack",
            "retention_prediction": 0.75,
            "hook_quality": 0.80,
            "commentary_hype": 0.70
        }

    def test_editor_personas(self):
        engine = EditorPersonaEngine()
        tiktok_res = engine.apply_persona(self.variant, "tiktok")
        self.assertLessEqual(tiktok_res["duration"], 15.0)
        self.assertEqual(tiktok_res["zoom"], "tight")

    def test_editor_distillation(self):
        engine = EditorDistillationEngine(dataset_path="human_editor_dataset_v2/gold_annotations.json")
        meta_tiktok = {"duration": 10.0, "zoom": "tight", "focus": "player", "story": "player_focus"}
        pred_tiktok = engine.predict_style(meta_tiktok)
        self.assertEqual(pred_tiktok["predicted_editor_style"], "tiktok")

    def test_match_importance(self):
        engine = MatchImportanceEngine()
        friendly = {"competition": "friendly", "stage": "regular_season", "home_score": 3, "away_score": 0, "time_minutes": 70.0}
        world_cup_final = {"competition": "world_cup", "stage": "final", "home_score": 2, "away_score": 2, "time_minutes": 89.0, "league_position_context": "title_decider"}
        friendly_score = engine.calculate_importance(friendly)
        wc_score = engine.calculate_importance(world_cup_final)
        self.assertGreater(wc_score, friendly_score)

    def test_player_importance(self):
        engine = PlayerImportanceEngine()
        event_a = {"player": "messi", "role": "mvp", "event_type": "play", "time_minutes": 20.0}
        res_a = engine.calculate_player_impact(event_a)
        self.assertGreater(res_a["fame_score"], 0.5)

    def test_candidate_diversity(self):
        engine = CandidateDiversityEngine(similarity_threshold=0.85)
        candidates = [
            {"variant": {"start": 10.0, "end": 20.0, "focus": "player", "zoom": "tight", "story_type": "counterattack"}, "score": 0.95},
            {"variant": {"start": 10.5, "end": 20.0, "focus": "player", "zoom": "tight", "story_type": "counterattack"}, "score": 0.90},
            {"variant": {"start": 30.0, "end": 45.0, "focus": "tactical", "zoom": "wide", "story_type": "late_game_drama"}, "score": 0.80}
        ]
        filtered = engine.filter_candidates(candidates)
        self.assertEqual(len(filtered), 2)

    def test_moment_boundary_optimizer(self):
        optimizer = MomentBoundaryOptimizer()
        res = optimizer.optimize_boundaries(100.0, "goal")
        self.assertIsNotNone(res["best_boundary"])
        self.assertEqual(len(res["all_combinations"]), 25)

    def test_football_director(self):
        engine = FootballDirectorEngine()
        timeline = [
            {"timestamp": 10.0, "events": ["goal"], "stage": "Climax", "ball_visible": True},
            {"timestamp": 12.0, "events": ["celebration"], "stage": "Payoff", "ball_visible": False}
        ]
        res = engine.recommend_focus(timeline)
        self.assertGreaterEqual(res["director_score"], 0.80)
        self.assertEqual(res["focus_decisions"][0]["primary_focus"], "ball")
        self.assertEqual(res["focus_decisions"][1]["primary_focus"], "player")

    def test_replay_story(self):
        engine = ReplayStoryEngine()
        timeline = [
            {"timestamp": 10.0, "events": ["goal"], "stage": "Climax"},
            {"timestamp": 25.0, "events": ["replay_transition"], "stage": "Payoff", "is_slow_motion": True}
        ]
        res = engine.evaluate_replays(timeline)
        self.assertGreater(res["replay_quality_score"], 0.5)
        self.assertEqual(len(res["replay_plan"]), 1)

    def test_outcome_learning(self):
        engine = OutcomeLearningEngine()
        metrics = {"watch_time": 0.85, "completion_rate": 0.70, "rewatch_rate": 0.30, "likes": 500, "shares": 100}
        score = engine.calculate_outcome_score(metrics)
        self.assertGreater(score, 0.0)

    def test_retention_v3_and_patterns(self):
        # Retention Predictor V3
        predictor = RetentionPredictorV3()
        var = {"hook_quality": 0.8, "commentary_hype": 0.9, "motion_intensity": 0.7, "tension": 0.8}
        pred_score = predictor.predict_retention(var)
        self.assertGreater(pred_score, 0.0)

        # Pattern engine
        pattern_engine = FootballPatternEngine()
        match_info = {"competition": "world_cup"}
        event = {"event_type": "goal", "time_minutes": 89.0, "is_winning_goal": True, "home_score": 2, "away_score": 1}
        pat_res = pattern_engine.detect_patterns(match_info, event)
        self.assertIn("late_game_winner", pat_res["detected_patterns"])

    def test_multi_stage_arena_pruning(self):
        simulator = InternalArenaSimulator()
        variants = [
            {"start": 10.0, "end": 35.0, "story_type": "counterattack"},
            {"start": 5.0, "end": 20.0, "story_type": "player_focus"}
        ]
        match_info = {"competition": "world_cup", "stage": "final", "home_score": 2, "away_score": 2, "time_minutes": 89.0}
        player_event = {"player": "bellingham", "role": "regular", "event_type": "goal", "is_winning_goal": True, "time_minutes": 90.0}
        timeline = [
            {"timestamp": 10.0, "events": ["goal"], "stage": "Climax"},
            {"timestamp": 25.0, "events": ["replay_transition"], "stage": "Payoff", "is_slow_motion": True}
        ]
        result = simulator.evaluate_variants(variants, match_info, player_event, timeline)
        self.assertIsNotNone(result["winner"])
        self.assertGreater(result["winner_score"], 0.0)
        self.assertEqual(result["original_candidate_count"], 10)

if __name__ == "__main__":
    unittest.main()
