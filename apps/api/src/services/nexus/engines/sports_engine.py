import os
import sys
import json
import argparse
import numpy as np

class SportsIntelligenceEngine:
    def __init__(self, width=1920, height=1080):
        self.W = width
        self.H = height
        
        # State machine states
        self.state = "BuildUp"  # BuildUp, CounterAttack, FinalThird, Cross, Shot, Save, Goal, Celebration, Crowd, Replay
        self.frames_since_goal = 0
        self.goal_detected_frame = -1
        
        # Velocity and history tracking
        self.ball_trajectory = []

    def classify_roles(self, tracks):
        """
        Heuristically classifies tracks into players, referee, ball, and scoreboard.
        """
        classified = {
            "players": [],
            "referee": None,
            "ball": None,
            "scoreboard": None
        }

        for t in tracks:
            category = t.get("category", "person")
            bbox = t["bbox"]  # [x1, y1, x2, y2] normalized
            
            # Scoreboard: screen in top 20% of frame with small relative area
            if category == "screen" and bbox[1] < 0.20:
                area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                if area < 0.08:
                    classified["scoreboard"] = t
                    continue

            if category == "sports ball":
                classified["ball"] = t
                continue

            if category == "person":
                # Referee heuristic: central position, isolated from clusters, steady motion
                c_x = (bbox[0] + bbox[2]) / 2.0
                c_y = (bbox[1] + bbox[3]) / 2.0
                
                # Check if central zone and not near edge
                is_referee_candidate = (0.30 < c_x < 0.70) and (0.30 < c_y < 0.70)
                
                # Simple heuristic for demo: first central isolated person is ref
                if is_referee_candidate and classified["referee"] is None:
                    classified["referee"] = t
                else:
                    classified["players"].append(t)

        return classified

    def detect_event_state(self, classified, frame_idx):
        """
        Executes the upgraded football state machine based on track locations.
        """
        ball = classified["ball"]
        players = classified["players"]
        
        # Simple velocity extraction
        vel_mag = 0.0
        if ball:
            vel = ball.get("velocity", [0.0, 0.0])
            vel_mag = np.sqrt(vel[0]**2 + vel[1]**2)

        # State transitions
        if self.state in ["BuildUp", "CounterAttack", "FinalThird", "Cross", "Shot", "Save"]:
            if ball:
                bb = ball["bbox"]
                bc_x = (bb[0] + bb[2]) / 2.0
                bc_y = (bb[1] + bb[3]) / 2.0

                if (bc_x < 0.08 or bc_x > 0.92) and (0.30 < bc_y < 0.70):
                    # Entered goal
                    if vel_mag < 0.005:
                        self.state = "Goal"
                        self.goal_detected_frame = frame_idx
                        self.frames_since_goal = 0
                        return self.state

                # Check Cross / Shot transitions
                if vel_mag > 0.035:
                    self.state = "Shot"
                elif 0.20 < bc_x < 0.80 and vel_mag > 0.025:
                    self.state = "Cross"
                elif bc_x < 0.30 or bc_x > 0.70:
                    self.state = "FinalThird"
                elif vel_mag > 0.015:
                    self.state = "CounterAttack"
                else:
                    self.state = "BuildUp"

        elif self.state == "Goal":
            self.frames_since_goal += 1
            if self.frames_since_goal > 60:
                self.state = "Celebration"
                self.frames_since_goal = 0

        elif self.state == "Celebration":
            self.frames_since_goal += 1
            if self.frames_since_goal > 120:
                self.state = "Crowd"
                self.frames_since_goal = 0

        elif self.state == "Crowd":
            self.frames_since_goal += 1
            if self.frames_since_goal > 90:
                self.state = "Replay"
                self.frames_since_goal = 0

        elif self.state == "Replay":
            self.frames_since_goal += 1
            if self.frames_since_goal > 90:
                self.state = "BuildUp"
                self.frames_since_goal = 0

        return self.state

    def calculate_crop(self, classified, state):
        """
        Outputs 9:16 crop parameters optimized for the active sports state.
        """
        target_cx, target_cy = self.W / 2.0, self.H / 2.0
        target_ch = self.H
        
        ball = classified["ball"]
        players = classified["players"]
        scoreboard = classified["scoreboard"]

        if state == "BuildUp":
            # BuildUp: Wide view of midfield
            target_ch = self.H * 0.95
        elif state == "CounterAttack":
            # CounterAttack: Ball-centric view
            if ball:
                bb = ball["bbox"]
                target_cx = (bb[0] + bb[2]) / 2.0 * self.W
                target_cy = (bb[1] + bb[3]) / 2.0 * self.H
                target_ch = self.H * 0.85
        elif state == "FinalThird":
            # FinalThird: Keep ball and goal boundaries inside crop
            if ball:
                bb = ball["bbox"]
                bc_x = (bb[0] + bb[2]) / 2.0 * self.W
                target_cx = (bc_x + (self.W if bc_x > self.W/2.0 else 0)) / 2.0
                target_ch = self.H * 0.80
        elif state == "Shot":
            # Shot: Zoom tightly on the ball
            if ball:
                bb = ball["bbox"]
                target_cx = (bb[0] + bb[2]) / 2.0 * self.W
                target_cy = (bb[1] + bb[3]) / 2.0 * self.H
                target_ch = self.H * 0.60
        elif state == "Goal":
            # Goal: Zoom closely on the net/ball
            if ball:
                bb = ball["bbox"]
                target_cx = (bb[0] + bb[2]) / 2.0 * self.W
                target_cy = (bb[1] + bb[3]) / 2.0 * self.H
                target_ch = self.H * 0.50
        elif state == "Celebration":
            # Celebration: Focus closely on celebrating players
            if players:
                xs = [(p["bbox"][0] + p["bbox"][2]) / 2.0 * self.W for p in players]
                ys = [(p["bbox"][1] + p["bbox"][3]) / 2.0 * self.H for p in players]
                target_cx = np.mean(xs)
                target_cy = np.mean(ys)
                target_ch = self.H * 0.65
        elif state == "Crowd":
            # Crowd: Focus on audience/reaction view
            target_ch = self.H * 0.90
        elif state == "Replay":
            # Replay: Cinematic focus
            target_ch = self.H * 0.75

        # Aspect ratio math 9:16
        target_cw = target_ch * (9.0 / 16.0)
        
        # Clamp crop inside boundaries
        half_w = target_cw / 2.0
        half_h = target_ch / 2.0
        
        if target_cx - half_w < 0:
            target_cx = half_w
        elif target_cx + half_w > self.W:
            target_cx = self.W - half_w
            
        if target_cy - half_h < 0:
            target_cy = half_h
        elif target_cy + half_h > self.H:
            target_cy = self.H - half_h
            
        crop_w = int(round(target_cw))
        crop_h = int(round(target_ch))
        crop_x = int(round(target_cx - half_w))
        crop_y = int(round(target_cy - half_h))

        return {
            "w": crop_w,
            "h": crop_h,
            "x": crop_x,
            "y": crop_y,
            "ffmpeg_filter": f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
        }

        # Aspect ratio math 9:16
        target_cw = target_ch * (9.0 / 16.0)
        
        # Clamp crop inside boundaries
        half_w = target_cw / 2.0
        half_h = target_ch / 2.0
        
        if target_cx - half_w < 0:
            target_cx = half_w
        elif target_cx + half_w > self.W:
            target_cx = self.W - half_w
            
        if target_cy - half_h < 0:
            target_cy = half_h
        elif target_cy + half_h > self.H:
            target_cy = self.H - half_h
            
        crop_w = int(round(target_cw))
        crop_h = int(round(target_ch))
        crop_x = int(round(target_cx - half_w))
        crop_y = int(round(target_cy - half_h))

        return {
            "w": crop_w,
            "h": crop_h,
            "x": crop_x,
            "y": crop_y,
            "ffmpeg_filter": f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
        }

def main():
    parser = argparse.ArgumentParser(description="Sports Video Reframing & Event Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write event states and crops")
    parser.add_argument("--width", type=int, default=1920, help="Source video width")
    parser.add_argument("--height", type=int, default=1080, help="Source video height")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        
        engine = SportsIntelligenceEngine(width=args.width, height=args.height)
        output_results = []

        for idx, entry in enumerate(frames_tracks):
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            classified = engine.classify_roles(tracks)
            state = engine.detect_event_state(classified, idx)
            crop_coords = engine.calculate_crop(classified, state)
            
            output_results.append({
                "frame": frame_name,
                "state": state,
                "crop": crop_coords
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
