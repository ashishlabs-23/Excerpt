import os
import sys
import json
import argparse

class StoryContextEngine:
    def __init__(self):
        pass

    def determine_story_start(self, events):
        """
        Walks backwards from a Goal event to find the true story_start
        by tracing the possession chain (Cross, Pass, Recovery, BuildUp).
        """
        goals = [e for e in events if e.get("event", "").lower() == "goal"]
        if not goals:
            return {"status": "no_goals_found"}

        results = []
        for goal in goals:
            goal_time = goal.get("start_time", 0)
            story_start = goal_time
            possession_chain = ["Goal"]
            
            # Walk backwards
            # Assuming events are sorted chronologically
            past_events = [e for e in events if e.get("start_time", 0) < goal_time]
            past_events.sort(key=lambda x: x.get("start_time", 0), reverse=True)
            
            # We look back up to 25 seconds for the continuous possession chain
            for e in past_events:
                e_type = e.get("event", "").lower()
                e_start = e.get("start_time", 0)
                
                # If there is a huge gap in events (e.g. > 10 seconds without an action), 
                # we break the chain
                if story_start - e.get("end_time", e_start) > 10:
                    break
                    
                if e_type in ["pass", "cross", "recovery", "transition", "buildup"]:
                    story_start = e_start
                    possession_chain.insert(0, e_type.capitalize())
                elif e_type in ["foul", "stoppage", "out_of_bounds"]:
                    # Dead ball situations break the open play possession chain
                    break
                    
            results.append({
                "goal_time": goal_time,
                "story_start": story_start,
                "possession_chain": " -> ".join(possession_chain)
            })

        return {"status": "success", "contexts": results}

def main():
    parser = argparse.ArgumentParser(description="Story Context Engine")
    parser.add_argument("--events-json", required=True, help="Path to events classification JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write narrative context results")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Handle different structures
        if isinstance(data, dict):
            if "football_events_results" in data:
                events = data["football_events_results"].get("results", [])
            elif "results" in data:
                events = data["results"]
            else:
                events = []
        else:
            events = data

        engine = StoryContextEngine()
        result = engine.determine_story_start(events)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
