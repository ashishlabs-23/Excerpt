import os
import sys
import json
import argparse

class BallVisibilityRepair:
    def __init__(self):
        pass

    def repair_crop(self, metrics):
        visibility = metrics.get("ball_visibility", 1.0)
        
        needs_repair = visibility < 0.90
        adjusted_zoom = 1.0
        repair_strategy = "keep_original"

        if needs_repair:
            # Widen crop zoom by 15% to keep ball in frame boundary
            adjusted_zoom = 1.15
            repair_strategy = "widen_crop_aspect"

        return {
            "needs_repair": needs_repair,
            "original_visibility": visibility,
            "adjusted_zoom": adjusted_zoom,
            "repair_strategy": repair_strategy
        }

def main():
    parser = argparse.ArgumentParser(description="Ball Visibility Repair Feedback Loop")
    parser.add_argument("--critic-json", required=True, help="Path to ball visibility metrics JSON")
    parser.add_argument("--output-json", required=True, help="Path to write repair adjustments")
    args = parser.parse_args()

    try:
        with open(args.critic_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        metrics = data.get("metrics", {}) if "metrics" in data else data
        repair = BallVisibilityRepair()
        result = repair.repair_crop(metrics)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "repair": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "repair": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
