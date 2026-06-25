import os
import sys
import json
import argparse

class FootballEditorAgent:
    def __init__(self):
        # Professional editing offsets (pre-roll / post-roll)
        self.policies = {
            "goal": {
                "name": "Goal Narrative Policy",
                "pre_roll": 12.0,  # Starts 8-15s before to catch buildup
                "post_roll": 8.0   # Ends 5-8s after celebration
            },
            "counterattack": {
                "name": "Turnover Transition Policy",
                "pre_roll": 15.0,  # Starts at possession shift
                "post_roll": 3.0   # Ends shortly after shot
            },
            "penalty": {
                "name": "Spot Placement Policy",
                "pre_roll": 18.0,  # Captures ball placement & run-up
                "post_roll": 5.0   # Captures keeper reaction
            },
            "red_card": {
                "name": "Foul and Card Policy",
                "pre_roll": 12.0,  # Captures the lead-up tackle
                "post_roll": 6.0   # Captures card visual
            },
            "var_review": {
                "name": "VAR Review Policy",
                "pre_roll": 25.0,  # Captures foul + review delay
                "post_roll": 10.0  # Captures referee final signal
            }
        }

    def edit_clip(self, event_type, event_time):
        event_key = event_type.lower().replace(" ", "_")
        policy = self.policies.get(event_key, {
            "name": "Standard Narrative Policy",
            "pre_roll": 8.0,
            "post_roll": 4.0
        })

        start_time = max(0.0, event_time - policy["pre_roll"])
        end_time = event_time + policy["post_roll"]

        return {
            "policy": policy["name"],
            "event_type": event_type,
            "event_time": event_time,
            "clip_start": round(start_time, 2),
            "clip_end": round(end_time, 2),
            "total_duration": round(end_time - start_time, 2)
        }

def main():
    parser = argparse.ArgumentParser(description="Football Highlights Editor Policy Agent")
    parser.add_argument("--event-type", required=True, help="Type of highlight event")
    parser.add_argument("--event-time", type=float, required=True, help="Timestamp of the event in seconds")
    parser.add_argument("--output-json", required=True, help="Path to write edited clip parameters")
    args = parser.parse_args()

    try:
        agent = FootballEditorAgent()
        result = agent.edit_clip(args.event_type, args.event_time)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "clip": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "clip": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
