import os
import sys
import json
import argparse
import numpy as np

class BallTrajectoryEngine:
    def __init__(self, sport="football"):
        self.sport = sport.lower()
        
        # Sport-specific physical constants (in normalized screen coordinates per frame)
        # drag coefficient d, gravity constant g
        if self.sport == "basketball":
            self.drag = 0.99
            self.gravity = 0.008
        elif self.sport == "tennis":
            self.drag = 0.96
            self.gravity = 0.006
        elif self.sport == "cricket":
            self.drag = 0.97
            self.gravity = 0.006
        else:  # football / default
            self.drag = 0.98
            self.gravity = 0.005

        self.ball_history = []
        self.velocity_history = []

    def process_frame(self, ball_track, players, frame_idx):
        """
        Processes current ball position, calculates kinematics, detects impacts, and projects paths.
        """
        bbox = ball_track["bbox"]
        c_x = (bbox[0] + bbox[2]) / 2.0
        c_y = (bbox[1] + bbox[3]) / 2.0
        pos = [c_x, c_y]

        self.ball_history.append(pos)
        if len(self.ball_history) > 100:
            self.ball_history.pop(0)

        # 1. Calculate Velocity & Acceleration
        vx, vy = 0.0, 0.0
        ax, ay = 0.0, 0.0
        
        if len(self.ball_history) > 1:
            prev = self.ball_history[-2]
            vx = pos[0] - prev[0]
            vy = pos[1] - prev[1]
            self.velocity_history.append([vx, vy])
            if len(self.velocity_history) > 50:
                self.velocity_history.pop(0)

        if len(self.velocity_history) > 1:
            prev_v = self.velocity_history[-2]
            ax = vx - prev_v[0]
            ay = vy - prev_v[1]

        # 2. Detect Impact Events
        # An impact (pass, bounce, hit) is a sudden angle shift > 35 degrees or velocity spike
        is_impact = False
        impact_type = None
        
        if len(self.velocity_history) > 1:
            v1 = self.velocity_history[-2]
            v2 = self.velocity_history[-1]
            
            dot_prod = v1[0] * v2[0] + v1[1] * v2[1]
            mag1 = np.sqrt(v1[0]**2 + v1[1]**2)
            mag2 = np.sqrt(v2[0]**2 + v2[1]**2)
            
            mags = mag1 * mag2
            if mags > 0:
                cos_theta = np.clip(dot_prod / mags, -1.0, 1.0)
                theta = np.arccos(cos_theta) * 180 / np.pi
                if theta > 35.0:
                    is_impact = True
                    impact_type = "bounce/direction_change"
                    
            # Check for sudden speed spike (e.g. shot)
            if mag1 > 0.002 and mag2 / mag1 > 2.0:
                is_impact = True
                impact_type = "kick/shot/strike"

        # 3. Project Anticipatory Path (15 frames look-ahead)
        predicted_path = []
        pred_x, pred_y = c_x, c_y
        pred_vx, pred_vy = vx, vy

        for k in range(15):
            # Apply drag and gravity
            pred_vx = pred_vx * self.drag
            pred_vy = pred_vy * self.drag + self.gravity
            
            pred_x = pred_x + pred_vx
            pred_y = pred_y + pred_vy
            
            # Clamp inside frame boundaries
            pred_x = np.clip(pred_x, 0.0, 1.0)
            pred_y = np.clip(pred_y, 0.0, 1.0)
            
            predicted_path.append([round(float(pred_x), 4), round(float(pred_y), 4)])

        # 4. Anticipate Shots, Passes, and Goals
        is_pass_anticipated = False
        is_shot_anticipated = False
        is_goal_anticipated = False
        
        # Check pass: predicted path intersects any player bbox
        for step in predicted_path:
            for p in players:
                pb = p["bbox"]
                if pb[0] <= step[0] <= pb[2] and pb[1] <= step[1] <= pb[3]:
                    is_pass_anticipated = True
                    break
            if is_pass_anticipated:
                break

        # Check goal/shot (in Football: x near edges, y central)
        if predicted_path:
            final_step = predicted_path[-1]
            if self.sport == "football":
                if (final_step[0] < 0.08 or final_step[0] > 0.92) and (0.35 < final_step[1] < 0.65):
                    is_shot_anticipated = True
                    if final_step[0] < 0.05 or final_step[0] > 0.95:
                        is_goal_anticipated = True
            elif self.sport == "basketball":
                # Basketball shot: high arc landing near hoop coordinates (e.g. x~0.1 or x~0.9, y~0.3)
                if (0.05 < final_step[0] < 0.15 or 0.85 < final_step[0] < 0.95) and (0.25 < final_step[1] < 0.40):
                    is_shot_anticipated = True

        # 5. Calculate Ball Importance Score
        importance_score = 0.50
        # Increase for speed
        speed = np.sqrt(vx**2 + vy**2)
        importance_score += min(0.30, speed * 15.0)
        
        if is_impact:
            importance_score = 0.95
        if is_pass_anticipated:
            importance_score = 0.85
        if is_shot_anticipated:
            importance_score = 0.98

        return {
            "ball_position": [round(c_x, 4), round(c_y, 4)],
            "trajectory": [[round(p[0], 4), round(p[1], 4)] for p in self.ball_history[-10:]],
            "predicted_path": predicted_path,
            "importance_score": round(importance_score, 4),
            "events": {
                "impact": is_impact,
                "impact_type": impact_type,
                "anticipated_pass": is_pass_anticipated,
                "anticipated_shot": is_shot_anticipated,
                "anticipated_goal": is_goal_anticipated
            }
        }

    def process_timeline(self, frames_tracks):
        results = []
        for idx, entry in enumerate(frames_tracks):
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            # Find ball and players
            ball = None
            players = []
            for t in tracks:
                category = t.get("category", "person")
                if category == "sports ball":
                    ball = t
                elif category == "person":
                    players.append(t)

            ball_data = None
            if ball:
                ball_data = self.process_frame(ball, players, idx)

            results.append({
                "frame": frame_name,
                "ball_intelligence": ball_data
            })
        return results

def main():
    parser = argparse.ArgumentParser(description="Sports Ball Trajectory Intelligence Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write ball intelligence results")
    parser.add_argument("--sport", default="football", choices=["football", "basketball", "tennis", "cricket"], help="Active sport mode")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        
        engine = BallTrajectoryEngine(sport=args.sport)
        results = engine.process_timeline(frames_tracks)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": results}, f, indent=2)

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
