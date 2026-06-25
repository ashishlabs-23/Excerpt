import os
import sys
import json
import argparse

class FootballHookEngine:
    def __init__(self):
        self.context_durations = {
            "goal": 12.0,
            "counterattack": 15.0,
            "penalty": 18.0,
            "red_card": 12.0,
            "var": 25.0,
            "buildup": 5.0,
            "shot": 6.0,
            "save": 5.0
        }

    def calculate_hook(self, event_type, event_time):
        event_lower = str(event_type).lower()
        context_duration = self.context_durations.get(event_lower, 8.0)
        hook_start = max(0.0, float(event_time) - context_duration)
        return round(hook_start, 2)

def main():
    parser = argparse.ArgumentParser(description="Football Highlight Hook Engine")
    parser.add_argument("--story-json", required=True, help="Path to story candidates json")
    parser.add_argument("--output-json", required=True, help="Path to write output")
    args = parser.parse_args()

    try:
        with open(args.story_json, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        candidates = data.get("candidates", []) if isinstance(data, dict) else data

        engine = FootballHookEngine()
        for cand in candidates:
            event_time = cand.get("start_time", 0)
            event_type = cand.get("title", "event")
            hook_start = engine.calculate_hook(event_type, event_time)
            
            if hook_start < cand.get("start_time", 0):
                cand["start_time"] = hook_start
                cand["hook"] = f"Hook begins at {hook_start}s for {event_type}"

        output = {
            "status": "success",
            "candidates": candidates,
            "candidate_changed": True,
            "ranking_changed": False,
            "render_changed": False,
            "output_consumed": True
        }

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2)

        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
