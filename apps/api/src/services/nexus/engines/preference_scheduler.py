import os
import sys
import json
import argparse

class ExcerptPreferenceScheduler:
    def __init__(self, known_categories=None):
        self.known_categories = known_categories or {"football", "basketball", "podcast"}

    def evaluate_clip_for_human_vote(self, reward_prediction, critic_score, context):
        """
        Determines if a clip needs to be scheduled for human preference voting.
        """
        reasons = []
        
        # 1. Check Confidence
        confidence = reward_prediction.get("confidence", 1.0)
        if confidence < 0.60:
            reasons.append("Low reward model confidence")

        # 2. Check Disagreement between Critic and Reward
        reward_score = reward_prediction.get("human_preference", 0.5) * 100.0
        # Disagreement if one says good and other says bad (gap > 30 points)
        if abs(reward_score - critic_score) > 30.0:
            reasons.append(f"Critic/Reward score conflict (Critic: {critic_score}, Reward: {reward_score:.1f})")

        # 3. Check New Video Category
        video_type = context.get("video_type", "unknown")
        if video_type not in self.known_categories:
            reasons.append(f"New video category encountered: {video_type}")

        send_to_arena = len(reasons) > 0
        return {
            "send_to_arena": send_to_arena,
            "reasons": reasons
        }

def main():
    parser = argparse.ArgumentParser(description="Excerpt Active Learning Preference Scheduler")
    parser.add_argument("--reward-json", required=True, help="Path to reward model output JSON")
    parser.add_argument("--critic-score", type=float, required=True, help="Critic model score")
    parser.add_argument("--context-json", required=True, help="Path to clip context JSON")
    parser.add_argument("--output-json", required=True, help="Path to write schedule results JSON")
    args = parser.parse_args()

    try:
        with open(args.reward_json, "r", encoding="utf-8") as f:
            reward_prediction = json.load(f)
            
        with open(args.context_json, "r", encoding="utf-8") as f:
            context = json.load(f)

        scheduler = ExcerptPreferenceScheduler()
        results = scheduler.evaluate_clip_for_human_vote(reward_prediction, args.critic_score, context)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        print(json.dumps({
            "status": "success",
            "send_to_arena": results["send_to_arena"],
            "reasons": results["reasons"],
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
