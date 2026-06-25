import os
import sys
import json
import argparse

class CounterattackQualityEngine:
    def __init__(self):
        pass

    def refine_counterattack_clip(self, events, possession_changes):
        # Look for turnover (possession shift)
        turnover_time = 0.0
        for change in possession_changes:
            if change.get("possession_change"):
                turnover_time = change.get("timestamp", 0.0)
                break

        # Sequence matching: Turnover -> Progressive Carry -> Shot
        stages_detected = ["Turnover"]
        for entry in events:
            ev = entry.get("event")
            if ev == "CounterAttack" and "Space Creation" not in stages_detected:
                stages_detected.append("Space Creation")
                stages_detected.append("Progressive Carry")
            elif ev == "Shot" and "Shot" not in stages_detected:
                stages_detected.append("Final Pass")
                stages_detected.append("Shot")

        return {
            "stages_detected": stages_detected,
            "anchor_timestamp": round(turnover_time, 2),
            "suggested_pre_roll": 2.0,  # 2s before turnover for context
            "refined_start": max(0.0, round(turnover_time - 2.0, 2))
        }

def main():
    parser = argparse.ArgumentParser(description="Counterattack Quality Intelligence Engine")
    parser.add_argument("--events-json", required=True, help="Path to events JSON")
    parser.add_argument("--possession-json", required=True, help="Path to possession changes JSON")
    parser.add_argument("--output-json", required=True, help="Path to write refined boundaries")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            events_data = json.load(f)
        with open(args.possession_json, "r", encoding="utf-8") as f:
            poss_data = json.load(f)

        events = events_data.get("results", []) if isinstance(events_data, dict) else events_data
        possession_changes = poss_data.get("possession_changes", []) if isinstance(poss_data, dict) else poss_data

        engine = CounterattackQualityEngine()
        result = engine.refine_counterattack_clip(events, possession_changes)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "counterattack": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "counterattack": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
