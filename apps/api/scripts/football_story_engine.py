import os
import sys
import json
import argparse

class FootballStoryEngine:
    def __init__(self):
        pass

    def detect_story_arcs(self, events):
        """
        Groups sequence of frame events to identify narrative flows (e.g., Pressure -> Build-up -> Goal).
        """
        detected_arcs = []
        current_arc = []

        for entry in events:
            event = entry.get("event", "BuildUp")
            
            # Form story sequences
            if not current_arc or current_arc[-1] != event:
                current_arc.append(event)
                
            # If celebration detected, close story arc
            if event == "Celebration" and "Goal" in current_arc:
                story_pattern = " -> ".join(current_arc[-4:])
                detected_arcs.append({
                    "story_arc": f"Goal Sequence: {story_pattern}",
                    "completeness": 0.95,
                    "hype_boost": True
                })
                current_arc = []

        # Default narrative fallback
        if not detected_arcs:
            detected_arcs.append({
                "story_arc": "Standard Match Narrative (BuildUp -> Action)",
                "completeness": 0.80,
                "hype_boost": False
            })

        return detected_arcs

def main():
    parser = argparse.ArgumentParser(description="Football Narrative Story Arc Engine")
    parser.add_argument("--events-json", required=True, help="Path to events classification JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write narrative story arcs")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        events = data.get("results", []) if isinstance(data, dict) else data
        engine = FootballStoryEngine()
        result = engine.detect_story_arcs(events)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "story_arcs": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "story_arcs": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
