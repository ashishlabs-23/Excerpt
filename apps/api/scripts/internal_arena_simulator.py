import os
import sys
import json
import argparse

# Add local path to import engines
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from editor_persona_engine import EditorPersonaEngine
from candidate_diversity_engine import CandidateDiversityEngine
from player_importance_engine import PlayerImportanceEngine
from match_importance_engine import MatchImportanceEngine
from moment_boundary_optimizer import MomentBoundaryOptimizer
from football_director_engine import FootballDirectorEngine
from replay_story_engine import ReplayStoryEngine
from outcome_learning_engine import OutcomeLearningEngine
from retention_predictor_v3 import RetentionPredictorV3
from football_pattern_engine import FootballPatternEngine

class InternalArenaSimulator:
    def __init__(self, outcomes_json=None):
        self.persona_engine = EditorPersonaEngine()
        self.diversity_engine = CandidateDiversityEngine()
        self.player_engine = PlayerImportanceEngine()
        self.match_engine = MatchImportanceEngine()
        self.boundary_optimizer = MomentBoundaryOptimizer()
        self.director_engine = FootballDirectorEngine()
        self.replay_engine = ReplayStoryEngine()
        self.outcome_engine = OutcomeLearningEngine()
        self.retention_v3 = RetentionPredictorV3(outcomes_json)
        self.pattern_engine = FootballPatternEngine()

    def evaluate_variants(self, base_variants, match_info=None, player_event=None, timeline=None):
        raw_candidates = []
        
        # 1. Expand 20 Story Variants x 5 Editor Personas = 100 Candidates
        personas = ["tiktok", "analyst", "broadcaster", "highlight_channel", "retention_maximizer"]
        
        for v in base_variants:
            for persona in personas:
                emulated_variant = self.persona_engine.apply_persona(v, persona)
                
                # Apply boundary optimization
                event_type = emulated_variant.get("story_type", "play")
                event_time = emulated_variant.get("start", 0.0) + (emulated_variant.get("duration", 10.0) / 2.0)
                
                # Context modifiers for boundary selection
                context_scores = {
                    "commentary_hype": emulated_variant.get("commentary_hype", 0.5),
                    "tension": 0.8 if emulated_variant.get("story_type") == "late_game_drama" else 0.5
                }
                opt_res = self.boundary_optimizer.optimize_boundaries(event_time, event_type, context_scores)
                best_bounds = opt_res["best_boundary"]
                
                # Override bounds with optimized ones
                emulated_variant["start"] = best_bounds["start"]
                emulated_variant["end"] = best_bounds["end"]
                emulated_variant["duration"] = best_bounds["duration"]
                
                # Compute frame-by-frame director alignment score
                director_score = 0.85
                if timeline:
                    dir_res = self.director_engine.recommend_focus(timeline)
                    director_score = dir_res["director_score"]
                
                # Compute Replay Storytelling score
                replay_score = 0.50
                if timeline:
                    rep_res = self.replay_engine.evaluate_replays(timeline)
                    replay_score = rep_res["replay_quality_score"]

                # Use RetentionPredictorV3 for expected watch time
                retention = self.retention_v3.predict_retention(emulated_variant)
                reward_score = 0.85 if emulated_variant.get("story_type") == "player_focus" else 0.75
                critic_score = (director_score * 0.5) + (replay_score * 0.5)
                surprise = 0.88 if emulated_variant.get("story_type") == "late_game_drama" else 0.50
                story_completeness = 0.92 if emulated_variant.get("story_type") == "counterattack" else 0.80
                tension = 0.95 if emulated_variant.get("story_type") == "late_game_drama" else 0.60
                
                # Match Importance score boost
                match_importance = 0.50
                if match_info:
                    match_importance = self.match_engine.calculate_importance(match_info)
                
                # Player Importance score boost
                player_boost = 0.0
                if player_event:
                    player_impact = self.player_engine.calculate_player_impact(player_event)
                    player_boost = player_impact.get("player_impact_score", 0.0) * 0.15
                    
                # Football Pattern prior boost
                pattern_boost = 0.0
                if match_info and player_event:
                    pat_res = self.pattern_engine.detect_patterns(match_info, player_event)
                    pattern_boost = pat_res["pattern_boost"] * 0.10
                
                # New Arena weights:
                # 25% Retention + 20% RewardModel + 15% Critics + 10% Story + 15% Tension + 0.05 Surprise + 0.10 MatchImportance
                final_score = (
                    (retention * 0.25) +
                    (reward_score * 0.20) +
                    (critic_score * 0.15) +
                    (story_completeness * 0.10) +
                    (tension * 0.15) +
                    (surprise * 0.05) +
                    (match_importance * 0.10) +
                    player_boost +
                    pattern_boost
                )
                
                raw_candidates.append({
                    "variant": emulated_variant,
                    "score": round(float(final_score), 4)
                })
        
        # 2. Stage 1: Apply Candidate Diversity Filter to select top 20 diverse variants
        diverse_candidates = self.diversity_engine.filter_candidates(raw_candidates)
        pruned_candidates = diverse_candidates[:20]
        
        # 3. Stage 2: Select Top 5 from the Arena
        pruned_candidates.sort(key=lambda x: x["score"], reverse=True)
        top_5 = pruned_candidates[:5]
        
        # 4. Stage 3: Score top 5 with Outcome Predictor
        scored_top_5 = []
        for cand in top_5:
            # Predict outcome scores based on simulated metrics
            simulated_outcomes = {
                "watch_time": cand["variant"].get("retention_prediction", 0.80),
                "completion_rate": 0.75 if cand["variant"].get("pacing") == "fast" else 0.65,
                "rewatch_rate": 0.25 if cand["variant"].get("focus") == "goal" else 0.10,
                "likes": int(cand["score"] * 800),
                "shares": int(cand["score"] * 150)
            }
            outcome_score = self.outcome_engine.calculate_outcome_score(simulated_outcomes)
            
            # Combine Arena score and predicted Outcome Score
            combined_score = (cand["score"] * 0.6) + (outcome_score * 0.4)
            scored_top_5.append({
                "variant": cand["variant"],
                "score": round(combined_score, 4),
                "arena_score": cand["score"],
                "outcome_score": outcome_score
            })
            
        scored_top_5.sort(key=lambda x: x["score"], reverse=True)
        
        return {
            "winner": scored_top_5[0]["variant"] if scored_top_5 else None,
            "winner_score": scored_top_5[0]["score"] if scored_top_5 else 0.0,
            "top_3": scored_top_5[:3],
            "original_candidate_count": len(raw_candidates),
            "pruned_candidate_count": len(pruned_candidates)
        }

def main():
    parser = argparse.ArgumentParser(description="Pre-Render Internal Arena Variant Selector")
    parser.add_argument("--variants-json", required=True, help="Path to story variants JSON file")
    parser.add_argument("--match-json", help="Path to match context JSON file")
    parser.add_argument("--event-json", help="Path to player event JSON file")
    parser.add_argument("--timeline-json", help="Path to timeline JSON file")
    parser.add_argument("--outcomes-json", help="Path to outcomes JSON database file")
    parser.add_argument("--output-json", required=True, help="Path to write the winning variant parameters")
    args = parser.parse_args()

    try:
        with open(args.variants_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        variants = data.get("variants", []) if isinstance(data, dict) else data
        
        match_info = None
        if args.match_json and os.path.exists(args.match_json):
            with open(args.match_json, "r", encoding="utf-8") as f:
                match_info = json.load(f)
                
        player_event = None
        if args.event_json and os.path.exists(args.event_json):
            with open(args.event_json, "r", encoding="utf-8") as f:
                player_event = json.load(f)

        timeline = None
        if args.timeline_json and os.path.exists(args.timeline_json):
            with open(args.timeline_json, "r", encoding="utf-8") as f:
                timeline = json.load(f)

        simulator = InternalArenaSimulator(args.outcomes_json)
        result = simulator.evaluate_variants(variants, match_info, player_event, timeline)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "winner": result["winner"],
            "winner_score": result["winner_score"],
            "original_count": result["original_candidate_count"],
            "pruned_count": result["pruned_candidate_count"]
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
