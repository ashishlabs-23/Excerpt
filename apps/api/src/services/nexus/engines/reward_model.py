import os
import sys
import json
import argparse
import numpy as np

class ExcerptRewardModel:
    def __init__(self):
        # Coefficients/Weights for features
        self.weights = {
            "duration": 0.05,
            "caption_density": 0.10,
            "avg_zoom": 0.10,
            "speaker_changes": 0.10,
            "emotion_peak": 0.25,
            "motion_peak": 0.15,
            "story_completeness": 0.20,
            "hook_strength": 0.10,
            "ball_visibility": 0.15,
            "goal_importance": 0.15,
            "commentary_hype": 0.20,
            "possession_shift": 0.10,
            "scoreboard_visibility": 0.10,
            
            # Context and strategy weight offsets (learned/trained)
            "context_speaker_count": 0.02,
            "inter_football_x_avg_zoom": 0.15,
            "inter_podcast_x_speaker_changes": 0.20,
            "inter_football_x_action_first": 0.25,
            "inter_podcast_x_story_first": 0.25,
        }

        # Load weights from dynamic JSON configuration if present
        config_path = os.path.join(os.path.dirname(__file__), "football_reward_weights.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    custom_weights = json.load(f)
                    for k, v in custom_weights.items():
                        self.weights[k] = float(v)
            except Exception as e:
                print(f"[RewardModel]: Warning - failed to load JSON weights config: {e}", file=sys.stderr)

    def get_fused_features(self, features, context):
        """
        Flattens base features, context parameters, and strategy details into a single
        numerical feature dictionary including interaction terms.
        """
        fused = {}
        # Base numerical features
        for f in ["duration", "caption_density", "avg_zoom", "speaker_changes", "emotion_peak", "motion_peak", "story_completeness", "hook_strength", "ball_visibility", "goal_importance", "commentary_hype", "possession_shift", "scoreboard_visibility"]:
            fused[f] = float(features.get(f, 0.0))
            
        # Context parameters
        video_type = context.get("video_type", "unknown")
        platform = context.get("platform", "unknown")
        duration_bucket = context.get("duration_bucket", "unknown")
        speaker_count = float(context.get("speaker_count", 1))
        content_category = context.get("content_category", "unknown")
        editor_strategy = context.get("editor_strategy", "unknown")
        
        # Binary indicator features
        fused[f"context_video_type_{video_type}"] = 1.0
        fused[f"context_platform_{platform}"] = 1.0
        fused[f"context_duration_bucket_{duration_bucket}"] = 1.0
        fused[f"context_content_category_{content_category}"] = 1.0
        fused[f"context_editor_strategy_{editor_strategy}"] = 1.0
        fused["context_speaker_count"] = speaker_count
        
        # Context and strategy interactions
        # Fast zooms work for football, hurt podcasts (negative interaction)
        fused["inter_football_x_avg_zoom"] = fused["avg_zoom"] if video_type == "football" else 0.0
        fused["inter_podcast_x_speaker_changes"] = fused["speaker_changes"] if video_type == "podcast" else 0.0
        
        # Strategy preferences per category
        fused["inter_football_x_action_first"] = 1.0 if (video_type == "football" and editor_strategy == "action_first") else 0.0
        fused["inter_podcast_x_story_first"] = 1.0 if (video_type == "podcast" and editor_strategy == "story_first") else 0.0
        
        return fused

    def predict_reward(self, features, context):
        """
        Predicts human preference score, confidence, and contributions breakdown.
        """
        fused = self.get_fused_features(features, context)
        
        score = 0.0
        contributions = {}

        for feat, val in fused.items():
            # Dynamically initialize weights if not present
            if feat not in self.weights:
                self.weights[feat] = 0.0
            
            weight = self.weights[feat]
            contribution = val * weight
            score += contribution
            
            # Map contribution keys to friendly names for debugging
            friendly_name = feat
            if feat == "emotion_peak":
                friendly_name = "emotion"
            elif feat == "story_completeness":
                friendly_name = "story"
            elif feat == "hook_strength":
                friendly_name = "hook"
            elif feat == "motion_peak":
                friendly_name = "motion"
                
            contributions[friendly_name] = round(float(contribution), 4)

        # Sigmoid activation to get [0.0, 1.0] preference score
        human_preference = float(1.0 / (1.0 + np.exp(-score * 4.0 + 2.0)))
        
        # Confidence based on metadata richness and speaker count accuracy
        confidence = 0.85 if len(context) >= 4 else 0.55
        
        return {
            "human_preference": round(human_preference, 4),
            "confidence": confidence,
            "contributions": contributions
        }

    def train_on_pairwise_samples(self, samples, learning_rate=0.1):
        """
        Trains model weights using Bradley-Terry pairwise loss.
        """
        for sample in samples:
            chosen_features = sample["chosen"]
            chosen_context = sample.get("chosen_context", {})
            rejected_features = sample["rejected"]
            rejected_context = sample.get("rejected_context", {})
            
            c_fused = self.get_fused_features(chosen_features, chosen_context)
            r_fused = self.get_fused_features(rejected_features, rejected_context)
            
            # Ensure all keys exist in weights
            all_keys = set(c_fused.keys()).union(set(r_fused.keys()))
            for k in all_keys:
                if k not in self.weights:
                    self.weights[k] = 0.0
                    
            c_score = sum(c_fused.get(f, 0.0) * self.weights[f] for f in self.weights)
            r_score = sum(r_fused.get(f, 0.0) * self.weights[f] for f in self.weights)
            
            prob_chosen = 1.0 / (1.0 + np.exp(-(c_score - r_score)))
            
            # Gradient update for each weight
            for feat in self.weights.keys():
                grad = (1.0 - prob_chosen) * (c_fused.get(feat, 0.0) - r_fused.get(feat, 0.0))
                # Update weight using gradient ascent
                self.weights[feat] = round(float(np.clip(self.weights[feat] + learning_rate * grad, -2.0, 2.0)), 4)

    def select_best_candidates(self, candidates, context):
        """
        Top 15 Reward + 5 Random Candidates (exploration selection).
        """
        scored_candidates = []
        for idx, cand in enumerate(candidates):
            pred = self.predict_reward(cand["features"], context)
            scored_candidates.append({
                "idx": idx,
                "candidate": cand,
                "reward_score": pred["human_preference"],
                "confidence": pred["confidence"]
            })

        # Sort by reward score
        scored_candidates.sort(key=lambda x: x["reward_score"], reverse=True)

        top_15 = scored_candidates[:15]
        remaining = scored_candidates[15:]
        
        # Shuffle remaining for exploration
        if remaining:
            indices = np.arange(len(remaining))
            np.random.shuffle(indices)
            random_5 = [remaining[i] for i in indices[:5]]
        else:
            random_5 = []

        selected = top_15 + random_5
        return [item["candidate"] for item in selected]

    def multi_stage_search(self, candidates, context):
        """
        Multi-Stage Search Pipeline:
        100 Candidates -> Reward Model -> Top 20 -> Critic -> Top 10 -> Arena Sampling -> Top 5
        """
        # 1. Reward Model: Rank and select Top 20
        scored = []
        for idx, cand in enumerate(candidates):
            pred = self.predict_reward(cand["features"], context)
            scored.append({
                "candidate": cand,
                "reward_score": pred["human_preference"],
                "critic_score": cand.get("critic_score", 70.0)  # default if not set
            })
            
        scored.sort(key=lambda x: x["reward_score"], reverse=True)
        top_20 = scored[:20]
        
        # 2. Critic: Rank Top 20 and select Top 10 by Critic Score
        top_20.sort(key=lambda x: x["critic_score"], reverse=True)
        top_10 = top_20[:10]
        
        # 3. Arena Sampling: Select Top 5 (e.g. top 3 + 2 random from the remaining 7 for active learning exploration)
        top_3_arena = top_10[:3]
        remaining_7 = top_10[3:]
        
        if remaining_7:
            indices = np.arange(len(remaining_7))
            np.random.shuffle(indices)
            random_2 = [remaining_7[i] for i in indices[:2]]
        else:
            random_2 = []
            
        selected = top_3_arena + random_2
        return [item["candidate"] for item in selected]

def main():
    parser = argparse.ArgumentParser(description="Excerpt Preference Reward Model")
    parser.add_argument("--action", required=True, choices=["predict", "train"], help="Reward Model action")
    parser.add_argument("--data-json", required=True, help="Path to input data JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write output results")
    args = parser.parse_args()

    try:
        with open(args.data_json, "r", encoding="utf-8") as f:
            payload = json.load(f)
            
        model = ExcerptRewardModel()
        
        if args.action == "predict":
            features = payload.get("features", {})
            # Dynamically extract from orchestrated payload results
            if "goal_importance" not in features and "goal_importance_results" in payload:
                features["goal_importance"] = payload["goal_importance_results"].get("importance", {}).get("importance_score", 0.0)
            if "commentary_hype" not in features and "commentary_hype_results" in payload:
                features["commentary_hype"] = payload["commentary_hype_results"].get("hype", {}).get("hype_score", 0.0)
                
            context = payload.get("context", {})
            results = model.predict_reward(features, context)
        else: # train
            samples = payload.get("samples", [])
            model.train_on_pairwise_samples(samples)
            results = {"status": "trained", "weights": model.weights}

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        print(json.dumps({
            "status": "success",
            "action": args.action,
            "output_file": args.output_json
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
