import os
import sys
import json
import argparse

class GoalImportanceEngine:
    def __init__(self):
        pass

    def calculate_importance(self, minute, score_diff, hype_score, crowd_reaction):
        # Time weighting (higher at late game stages, massive boost for stoppage time)
        if minute >= 90:
            time_factor = 1.2
        else:
            # Exponential curve so late goals carry more weight than early goals
            time_factor = (minute / 90.0) ** 2

        # Score parity factor (draw-breakers are most important)
        if score_diff == 0:
            score_factor = 1.2
        elif abs(score_diff) == 1:
            score_factor = 0.8
        else:
            score_factor = max(0.2, 1.0 / (abs(score_diff) + 1))

        # excitement modifiers
        excitement_factor = (hype_score + crowd_reaction) / 2.0

        # Weighted calculation
        importance = (time_factor * 0.4) + (score_factor * 0.4) + (excitement_factor * 0.2)
        importance_score = min(1.0, max(0.0, importance))

        return {
            "time_factor": round(time_factor, 4),
            "score_factor": round(score_factor, 4),
            "excitement_factor": round(excitement_factor, 4),
            "importance_score": round(importance_score, 4),
            "candidate_changed": False,
            "ranking_changed": True,
            "render_changed": False,
            "output_consumed": True
        }

def main():
    parser = argparse.ArgumentParser(description="Goal Importance Ranking Engine")
    parser.add_argument("--minute", type=int, required=True, help="Match minute of the event")
    parser.add_argument("--score-diff", type=int, required=True, help="Difference in scores before the event")
    parser.add_argument("--hype", type=float, default=0.7, help="Commentary hype score")
    parser.add_argument("--crowd", type=float, default=0.7, help="Crowd reaction score")
    parser.add_argument("--output-json", required=True, help="Path to write importance score")
    args = parser.parse_args()

    try:
        engine = GoalImportanceEngine()
        result = engine.calculate_importance(args.minute, args.score_diff, args.hype, args.crowd)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "importance": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "importance": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
