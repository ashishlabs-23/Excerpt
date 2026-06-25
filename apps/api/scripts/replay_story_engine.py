import json
import argparse
import sys

class ReplayStoryEngine:
    def __init__(self):
        pass

    def evaluate_replays(self, timeline_segments):
        replays_detected = []
        climax_moments = []
        
        for segment in timeline_segments:
            timestamp = segment.get("timestamp", 0.0)
            events = [e.lower() for e in segment.get("events", [])]
            
            # Find climax triggers that typically warrant a replay (goals, near misses, saves)
            if any(evt in ["goal", "shot", "save", "foul", "red_card"] for evt in events):
                climax_moments.append({
                    "timestamp": timestamp,
                    "event": events[0] if events else "unknown_climax"
                })

            # Check if broadcast feed has transition or slow-mo replay
            is_slow_mo = segment.get("is_slow_motion", False)
            is_alt_angle = segment.get("is_alternative_angle", False)
            has_logo_wipe = "replay_transition" in events or "logo_wipe" in events

            if is_slow_mo or is_alt_angle or has_logo_wipe:
                replays_detected.append({
                    "timestamp": timestamp,
                    "slow_motion": is_slow_mo,
                    "alt_angle": is_alt_angle,
                    "logo_wipe": has_logo_wipe
                })

        # Assemble replay insertion plan
        replay_plan = []
        for climax in climax_moments:
            # Look for a replay occurring within 30 seconds after the climax
            associated_replay = None
            for rep in replays_detected:
                if 0.0 < (rep["timestamp"] - climax["timestamp"]) <= 30.0:
                    associated_replay = rep
                    break
            
            if associated_replay:
                replay_plan.append({
                    "climax_event": climax["event"],
                    "climax_timestamp": climax["timestamp"],
                    "replay_timestamp": associated_replay["timestamp"],
                    "style": "slow_motion" if associated_replay["slow_motion"] else "alt_angle"
                })

        # Calculate replay quality score: Higher if replays are properly placed after big events
        replay_score = 0.50
        if len(climax_moments) > 0:
            match_ratio = len(replay_plan) / len(climax_moments)
            replay_score = round(0.50 + (match_ratio * 0.45), 4)

        return {
            "replay_quality_score": replay_score,
            "replay_plan": replay_plan,
            "detected_count": len(replays_detected)
        }

def main():
    parser = argparse.ArgumentParser(description="Replay Story Engine")
    parser.add_argument("--timeline-json", required=True, help="Path to input timeline JSON")
    parser.add_argument("--output-json", required=True, help="Path to write replay evaluation JSON")
    args = parser.parse_args()

    try:
        with open(args.timeline_json, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)

        timeline = timeline_data.get("results", []) if isinstance(timeline_data, dict) else timeline_data
        engine = ReplayStoryEngine()
        result = engine.evaluate_replays(timeline)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps({
            "status": "success",
            "replay_quality_score": result["replay_quality_score"]
        }))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
