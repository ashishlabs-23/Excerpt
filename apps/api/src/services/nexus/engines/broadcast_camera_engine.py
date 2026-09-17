import os
import sys
import json
import argparse

class BroadcastCameraEngine:
    def __init__(self):
        pass

    def classify_camera(self, classified):
        players = classified.get("players", [])
        scoreboard = classified.get("scoreboard")
        ball = classified.get("ball")

        # Heuristic rules
        if len(players) > 8 and scoreboard:
            # Many players and scoreboard visible -> Wide Tactical view
            return "Wide Tactical"
        elif len(players) > 5:
            # Medium players -> Close Tactical view
            return "Close Tactical"
        elif len(players) >= 1 and len(players) <= 2:
            # Very few people -> Player Closeup
            return "Player Closeup"
        elif not players and scoreboard:
            # Only scoreboard -> Goal / Scoreboard Camera
            return "Goal Camera"
        else:
            # Fallback
            return "Wide Tactical"

def main():
    parser = argparse.ArgumentParser(description="Broadcast Camera Classifier Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write camera classifications")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        engine = BroadcastCameraEngine()
        output_results = []

        for idx, entry in enumerate(frames_tracks):
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            classified = {
                "players": [t for t in tracks if t.get("category") == "person"],
                "ball": next((t for t in tracks if t.get("category") == "sports ball"), None),
                "scoreboard": next((t for t in tracks if t.get("category") == "screen"), None)
            }
            
            camera_type = engine.classify_camera(classified)
            output_results.append({
                "frame": frame_name,
                "camera_type": camera_type
            })

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": output_results}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "results": output_results[:5]  # Print snippet
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
