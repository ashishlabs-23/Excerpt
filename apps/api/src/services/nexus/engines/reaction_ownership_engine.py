import os
import sys
import json
import argparse

class ReactionOwnershipEngine:
    def __init__(self):
        pass

    def determine_reaction_end(self, events, emotions):
        """
        Calculates the true reaction_end by finding the end of the celebration 
        or the drop in crowd/commentary excitement following a Goal.
        """
        goals = [e for e in events if e.get("event", "").lower() == "goal"]
        if not goals:
            return {"status": "no_goals_found"}

        results = []
        for goal in goals:
            goal_time = goal.get("start_time", 0)
            reaction_end = goal_time + 10 # Default fallback
            
            # Look for post-goal events (Celebration, Crowd Shot, Bench)
            post_events = [e for e in events if e.get("start_time", 0) >= goal_time]
            post_events.sort(key=lambda x: x.get("start_time", 0))
            
            reaction_components = ["Goal"]
            
            for e in post_events:
                e_type = e.get("event", "").lower()
                e_end = e.get("end_time", e.get("start_time", 0))
                
                # If it's a kickoff or restart, the reaction is definitely over
                if e_type in ["kickoff", "restart", "play_resume"]:
                    break
                    
                if e_type in ["celebration", "crowd", "bench", "player_reaction", "replay"]:
                    # Extend the reaction end to the end of the celebration
                    reaction_end = max(reaction_end, e_end)
                    if e_type.capitalize() not in reaction_components:
                        reaction_components.append(e_type.capitalize())
                elif (e.get("start_time", 0) - goal_time) > 45:
                    # Hard cap at 45 seconds post-goal
                    break
                    
            # Check audio/emotion data to see if crowd noise extends even further
            # Assuming emotions has timestamps
            if emotions:
                for em in emotions:
                    em_time = em.get("timestamp", 0)
                    em_score = em.get("excitement_score", 0)
                    if goal_time < em_time < goal_time + 45:
                        if em_score > 0.6:
                            # High excitement continues
                            reaction_end = max(reaction_end, em_time)
                            if "Sustained Crowd" not in reaction_components:
                                reaction_components.append("Sustained Crowd")
            
            results.append({
                "goal_time": goal_time,
                "reaction_end": reaction_end,
                "reaction_components": " + ".join(reaction_components)
            })

        return {"status": "success", "reactions": results}

def main():
    parser = argparse.ArgumentParser(description="Reaction Ownership Engine")
    parser.add_argument("--events-json", required=True, help="Path to events classification JSON file")
    parser.add_argument("--emotion-json", required=False, help="Path to emotion/audio JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write reaction results")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        events = []
        if isinstance(data, dict):
            if "football_events_results" in data:
                events = data["football_events_results"].get("results", [])
            elif "results" in data:
                events = data["results"]
            
        emotions = []
        if args.emotion_json and os.path.exists(args.emotion_json):
            with open(args.emotion_json, "r", encoding="utf-8") as f:
                emo_data = json.load(f)
                if isinstance(emo_data, dict):
                    if "emotion_results" in emo_data:
                        emotions = emo_data["emotion_results"].get("timeline", [])
                    elif "timeline" in emo_data:
                        emotions = emo_data["timeline"]
                elif isinstance(emo_data, list):
                    emotions = emo_data

        engine = ReactionOwnershipEngine()
        result = engine.determine_reaction_end(events, emotions)

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
