import os
import sys
import json
import argparse

class VarStoryEngine:
    def __init__(self):
        pass

    def evaluate_var_sequence(self, events):
        # Scan events list to extract key stages
        stages = ["Incident"]
        has_var = False
        var_start_idx = 0

        for idx, entry in enumerate(events):
            ev = entry.get("event")
            if ev == "VAR":
                has_var = True
                var_start_idx = idx
                break

        if has_var:
            stages.append("Confusion")
            stages.append("Review")
            stages.append("Decision")
            stages.append("Reaction")

        # Refined boundary outputs: starts 15s before the VAR review to capture foul, ends 10s after decision
        var_timestamp = var_start_idx / 30.0  # Assume 30fps
        return {
            "var_sequence_found": has_var,
            "stages": stages,
            "refined_start": max(0.0, round(var_timestamp - 15.0, 2)),
            "refined_end": round(var_timestamp + 25.0, 2)
        }

def main():
    parser = argparse.ArgumentParser(description="VAR Story Narrative Engine")
    parser.add_argument("--events-json", required=True, help="Path to events JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write VAR boundaries")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        events = data.get("results", []) if isinstance(data, dict) else data
        engine = VarStoryEngine()
        result = engine.evaluate_var_sequence(events)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "var_story": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "var_story": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
