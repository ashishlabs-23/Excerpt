import os
import sys
import json
import argparse

class SurpriseEngine:
    def __init__(self):
        pass

    def calculate_surprise(self, event_type, minute, score_diff):
        # Base surprise level per event
        base_surprise = 0.5
        event_lower = event_type.lower()

        if "own_goal" in event_lower or "mistake" in event_lower:
            base_surprise = 0.90
        elif "goal" in event_lower:
            base_surprise = 0.75
        elif "card" in event_lower:
            base_surprise = 0.60

        # Late-game multiplier (high surprise for deciders at 85'+)
        time_mult = 1.2 if minute >= 85 else 1.0
        
        # Parity multiplier (draw breakers have higher surprise impact)
        parity_mult = 1.15 if score_diff == 0 else 1.0

        surprise_score = min(1.0, base_surprise * time_mult * parity_mult)

        return {
            "base_surprise": base_surprise,
            "surprise_score": round(surprise_score, 4),
            "unexpected": surprise_score > 0.80
        }

def main():
    parser = argparse.ArgumentParser(description="Football Surprise Highlight Engine")
    parser.add_argument("--event-type", required=True, help="Type of game event")
    parser.add_argument("--minute", type=int, required=True, help="Match minute")
    parser.add_argument("--score-diff", type=int, required=True, help="Pre-event score difference")
    parser.add_argument("--output-json", required=True, help="Path to write surprise score")
    args = parser.parse_args()

    try:
        engine = SurpriseEngine()
        result = engine.calculate_surprise(args.event_type, args.minute, args.score_diff)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "surprise": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "surprise": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
