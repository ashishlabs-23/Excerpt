import os
import sys
import json
import argparse
import numpy as np

class FootballEventEngine:
    def __init__(self, width=1920, height=1080):
        self.W = width
        self.H = height
        self.current_event = "BuildUp"
        self.consecutive_passes = 0
        self.possession_team = None
        self.shot_detected_frame = -1
        self.frames_since_event = 0

    def analyze_frame_events(self, classified, frame_idx):
        """
        Determines the current football event phase using positions, velocities, and heuristics.
        """
        ball = classified.get("ball")
        players = classified.get("players", [])
        referee = classified.get("referee")
        scoreboard = classified.get("scoreboard")

        # Basic default state
        event_state = "BuildUp"

        # Heuristic 1: Penalty detection
        # If referee is close to penalty area or players are lined up on the box edge
        if len(players) > 5:
            # Check if many players are aligned vertically or horizontally around y ~ 0.5
            y_coords = [(p["bbox"][1] + p["bbox"][3]) / 2.0 for p in players]
            if np.std(y_coords) < 0.05 and any(p["bbox"][0] > 0.80 for p in players):
                event_state = "Penalty"

        # Heuristic 2: CounterAttack detection
        # High ball velocity in horizontal direction indicating rapid transition
        if ball:
            vel = ball.get("velocity", [0.0, 0.0])
            vel_mag = np.sqrt(vel[0]**2 + vel[1]**2)
            if vel_mag > 0.04:  # High speed transition
                event_state = "CounterAttack"

        # Heuristic 3: Shot vs Save vs Goal
        if ball:
            b_box = ball["bbox"]
            bc_x = (b_box[0] + b_box[2]) / 2.0
            bc_y = (b_box[1] + b_box[3]) / 2.0
            
            # Ball enters net bounds
            if (bc_x < 0.06 or bc_x > 0.94) and (0.35 < bc_y < 0.65):
                event_state = "Goal"
            elif (bc_x < 0.12 or bc_x > 0.88) and (0.30 < bc_y < 0.70):
                # Ball is near goal but saved
                event_state = "Save"
            elif vel_mag > 0.035:
                event_state = "Shot"

        # Heuristic 4: Celebration and Crowd Replay
        if event_state == "Goal" or self.current_event == "Goal":
            self.frames_since_event += 1
            # Tighter, snappier clipping timing as observed in optimal short clips
            if self.frames_since_event < 45:      # 1.5s Goal
                event_state = "Goal"
            elif self.frames_since_event < 135:   # 3s Celebration
                event_state = "Celebration"
            elif self.frames_since_event < 180:   # 1.5s Crowd
                event_state = "Crowd"
            else:
                event_state = "Replay"
                self.frames_since_event = 0
        else:
            self.frames_since_event = 0

        self.current_event = event_state
        return event_state

def main():
    parser = argparse.ArgumentParser(description="Football Event Intelligence Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write event classifications")
    parser.add_argument("--width", type=int, default=1920, help="Video width")
    parser.add_argument("--height", type=int, default=1080, help="Video height")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        engine = FootballEventEngine(width=args.width, height=args.height)
        output_results = []

        for idx, entry in enumerate(frames_tracks):
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            # Filter categories
            classified = {
                "players": [t for t in tracks if t.get("category") == "person"],
                "ball": next((t for t in tracks if t.get("category") == "sports ball"), None),
                "referee": next((t for t in tracks if t.get("category") == "person" and t.get("is_referee")), None),
                "scoreboard": next((t for t in tracks if t.get("category") == "screen"), None)
            }
            
            event = engine.analyze_frame_events(classified, idx)
            output_results.append({
                "frame": frame_name,
                "event": event,
                "confidence": 0.95
            })

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": output_results}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "output_file": args.output_json
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
