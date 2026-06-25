import os
import sys
import json
import argparse
import numpy as np

class PossessionIntelligenceEngine:
    def __init__(self):
        pass

    def evaluate_possession(self, frames_tracks):
        possession_changes = []
        last_possessor = None

        for idx, entry in enumerate(frames_tracks):
            tracks = entry.get("tracks", [])
            ball = next((t for t in tracks if t.get("category") == "sports ball"), None)
            players = [t for t in tracks if t.get("category") == "person"]

            if ball and players:
                # Find nearest player to ball
                bb = ball["bbox"]
                bc_x = (bb[0] + bb[2]) / 2.0
                bc_y = (bb[1] + bb[3]) / 2.0

                min_dist = float("inf")
                closest_player_id = None
                for p in players:
                    pb = p["bbox"]
                    pc_x = (pb[0] + pb[2]) / 2.0
                    pc_y = (pb[1] + pb[3]) / 2.0
                    dist = np.sqrt((bc_x - pc_x)**2 + (bc_y - pc_y)**2)
                    if dist < min_dist:
                        min_dist = dist
                        closest_player_id = p.get("id")

                # If ball is extremely close to player, assume possession
                if min_dist < 0.08:
                    # Let's say odd player IDs are Team A and even are Team B
                    current_team = "TeamA" if (closest_player_id or 0) % 2 == 1 else "TeamB"
                    
                    if last_possessor and last_possessor != current_team:
                        # Possession shifted! Counterattack trigger!
                        possession_changes.append({
                            "frame": entry.get("frame"),
                            "possession_change": True,
                            "from": last_possessor,
                            "to": current_team,
                            "timestamp": idx / 30.0,  # Assume 30fps
                            "confidence": 0.94
                        })
                    
                    last_possessor = current_team

        return possession_changes

def main():
    parser = argparse.ArgumentParser(description="Football Possession Shift Detection Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write possession changes")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        engine = PossessionIntelligenceEngine()
        result = engine.evaluate_possession(frames_tracks)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "possession_changes": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "possession_changes": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
