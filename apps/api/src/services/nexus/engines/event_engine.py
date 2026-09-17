import os
import sys
import json
import argparse
import numpy as np

class MultimodalEventEngine:
    def __init__(self, sport="football", fps=30):
        self.sport = sport.lower()
        self.fps = fps
        
        # State histories
        self.frame_history = []
        self.ball_pos_history = []
        self.ball_velocity_history = []
        self.active_dribbler_id = None
        self.dribble_consecutive_frames = 0
        
        # Audio / visual thresholds
        self.audio_spike_threshold = 12.0  # dB increase
        self.motion_peak_threshold = 0.05   # Normalized motion vector magnitude
        
        # Hoop coordinate region (Basketball)
        self.hoop_coords = [[0.1, 0.35], [0.9, 0.35]] # left / right hoop
        
    def _calculate_distance(self, p1, p2):
        return np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def _get_bbox_center(self, bbox):
        return [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0]

    def process_frame(self, frame_idx, audio, motion, tracking, ball_data):
        """
        Analyzes multimodal frame data to detect active sports events.
        """
        # Save state to history
        current_frame = {
            "frame_idx": frame_idx,
            "audio": audio or {},
            "motion": motion or {},
            "tracking": tracking or [],
            "ball_data": ball_data or {}
        }
        self.frame_history.append(current_frame)
        if len(self.frame_history) > 150: # 5 seconds history
            self.frame_history.pop(0)

        # Extract ball position
        ball_pos = None
        if ball_data and "ball_position" in ball_data:
            ball_pos = ball_data["ball_position"]
            self.ball_pos_history.append(ball_pos)
        else:
            self.ball_pos_history.append(None)
            
        if len(self.ball_pos_history) > 100:
            self.ball_pos_history.pop(0)

        # Detect event
        detected_event = "action"
        confidence = 0.50
        
        if self.sport == "football":
            detected_event, confidence = self._detect_football_events(current_frame)
        elif self.sport == "basketball":
            detected_event, confidence = self._detect_basketball_events(current_frame)
            
        timestamp = frame_idx / self.fps
        
        return {
            "event": detected_event,
            "confidence": round(confidence, 4),
            "timestamp": round(timestamp, 2)
        }

    def _detect_football_events(self, current_frame):
        audio = current_frame["audio"]
        motion = current_frame["motion"]
        tracking = current_frame["tracking"]
        ball_data = current_frame["ball_data"]
        
        events_flag = ball_data.get("events", {}) if ball_data else {}
        ball_pos = ball_data.get("ball_position") if ball_data else None
        
        # 1. Goal Detection
        # Check if anticipated_goal is true, or ball is inside net area and audio decibel levels spike
        is_goal = False
        goal_confidence = 0.5
        if ball_pos:
            if (ball_pos[0] < 0.05 or ball_pos[0] > 0.95) and (0.35 < ball_pos[1] < 0.65):
                # Check for audio volume increase
                audio_db = audio.get("db", 0.0)
                audio_flux = audio.get("spectral_flux", 0.0)
                if audio_db > 75.0 or audio_flux > 1.5:
                    is_goal = True
                    goal_confidence = 0.98
                elif events_flag.get("anticipated_goal"):
                    is_goal = True
                    goal_confidence = 0.85
                    
        if is_goal:
            return "goal", goal_confidence

        # 2. Celebration
        # Multiple players cluster together with low motion intensity after a shot/goal
        players = [t for t in tracking if t.get("category") == "person"]
        if len(players) >= 3:
            centroids = [self._get_bbox_center(p["bbox"]) for p in players]
            # Average distance
            pair_dists = []
            for i in range(len(centroids)):
                for j in range(i+1, len(centroids)):
                    pair_dists.append(self._calculate_distance(centroids[i], centroids[j]))
            if pair_dists and np.mean(pair_dists) < 0.15:
                # Celebration check
                # Check if recent frames had a goal or shot
                recent_shot_or_goal = False
                for f in self.frame_history[-60:]:
                    f_ball = f.get("ball_data", {})
                    if f_ball:
                        f_events = f_ball.get("events", {})
                        if f_events.get("anticipated_goal") or f_events.get("anticipated_shot"):
                            recent_shot_or_goal = True
                            break
                if recent_shot_or_goal:
                    return "celebration", 0.92

        # 3. Save / Goalkeeper Intervention
        # Goalkeeper (role/category person) intersects predicted shot trajectory and ball bounces
        if events_flag.get("impact") and events_flag.get("impact_type") == "bounce/direction_change":
            # Check if goalkeeper is nearby
            gk_near = False
            for p in players:
                # Check if player is goalkeeper (e.g. role is goalkeeper or bbox is inside goalkeeper box)
                pb = p["bbox"]
                pc = self._get_bbox_center(pb)
                if ball_pos and self._calculate_distance(pc, ball_pos) < 0.12:
                    # Let's say this is GK if they are near the goal line
                    if pc[0] < 0.15 or pc[0] > 0.85:
                        gk_near = True
                        break
            if gk_near:
                # Check if ball was heading to goal
                recent_shot = False
                for f in self.frame_history[-10:]:
                    f_ball = f.get("ball_data", {})
                    if f_ball and f_ball.get("events", {}).get("anticipated_shot"):
                        recent_shot = True
                        break
                if recent_shot:
                    return "save", 0.88

        # 4. Miss
        # Ball is shot (anticipated_shot is true) but then goes out of boundaries (x < 0.05 or x > 0.95) outside goal height
        if ball_pos and (ball_pos[0] < 0.05 or ball_pos[0] > 0.95):
            if ball_pos[1] < 0.35 or ball_pos[1] > 0.65:
                # Was it a shot recently?
                recent_shot = False
                for f in self.frame_history[-15:]:
                    f_ball = f.get("ball_data", {})
                    if f_ball and f_ball.get("events", {}).get("anticipated_shot"):
                        recent_shot = True
                        break
                if recent_shot:
                    return "miss", 0.85

        # 5. Shot
        # Ball impact or kick trigger + moving fast towards goal post
        if events_flag.get("anticipated_shot") and events_flag.get("impact"):
            return "shot", 0.91

        # 6. Replay Detection
        # Check for replay graphic trigger or slow motion
        if motion.get("replay_graphic") or motion.get("slow_motion"):
            return "replay", 0.95

        # 7. Crowd Reaction
        # Global audio volume spike + motion density/vectors spike
        if audio.get("cheering") or (audio.get("db", 0.0) > 80.0 and motion.get("magnitude", 0.0) > self.motion_peak_threshold):
            return "crowd_reaction", 0.87

        # 8. Cross
        # High arc trajectory from flank towards center box
        if ball_pos and events_flag.get("impact"):
            # Flank starts: x < 0.25 or x > 0.75
            # We look at historical ball position
            if len(self.ball_pos_history) > 10:
                start_pos = next((x for x in self.ball_pos_history[-15:] if x is not None), None)
                if start_pos and (start_pos[0] < 0.30 or start_pos[0] > 0.70):
                    # Destination is center box: 0.30 < x < 0.70
                    if 0.30 < ball_pos[0] < 0.70:
                        # High vertical movement (cross has arc)
                        y_diffs = [abs(self.ball_pos_history[i][1] - self.ball_pos_history[i-1][1]) 
                                   for i in range(1, len(self.ball_pos_history)) 
                                   if self.ball_pos_history[i] and self.ball_pos_history[i-1]]
                        if y_diffs and max(y_diffs) > 0.01:
                            return "cross", 0.82

        # 9. Pass
        if events_flag.get("anticipated_pass") and events_flag.get("impact"):
            return "pass", 0.89

        # 10. Dribble
        # Ball is near a single player for multiple frames
        if ball_pos and len(players) > 0:
            dists = [self._calculate_distance(self._get_bbox_center(p["bbox"]), ball_pos) for p in players]
            min_dist_idx = np.argmin(dists)
            if dists[min_dist_idx] < 0.08:
                player_id = players[min_dist_idx].get("track_id")
                if player_id == self.active_dribbler_id:
                    self.dribble_consecutive_frames += 1
                else:
                    self.active_dribbler_id = player_id
                    self.dribble_consecutive_frames = 1
                
                if self.dribble_consecutive_frames > 12:  # ~0.4 seconds
                    return "dribble", min(0.95, 0.60 + self.dribble_consecutive_frames * 0.02)
            else:
                self.active_dribbler_id = None
                self.dribble_consecutive_frames = 0
        else:
            self.active_dribbler_id = None
            self.dribble_consecutive_frames = 0

        return "action", 0.50

    def _detect_basketball_events(self, current_frame):
        audio = current_frame["audio"]
        motion = current_frame["motion"]
        tracking = current_frame["tracking"]
        ball_data = current_frame["ball_data"]
        
        events_flag = ball_data.get("events", {}) if ball_data else {}
        ball_pos = ball_data.get("ball_position") if ball_data else None
        
        players = [t for t in tracking if t.get("category") == "person"]

        # 1. Dunk
        # Ball position overlaps hoop coordinates + player bbox overlaps hoop + high downward velocity (vy > 0.04)
        if ball_pos:
            for hoop in self.hoop_coords:
                if self._calculate_distance(ball_pos, hoop) < 0.10:
                    # Check player closeness to hoop
                    player_near = any(self._calculate_distance(self._get_bbox_center(p["bbox"]), hoop) < 0.18 for p in players)
                    if player_near:
                        # Check downward trajectory
                        if len(self.ball_pos_history) >= 2 and self.ball_pos_history[-2]:
                            vy = ball_pos[1] - self.ball_pos_history[-2][1]
                            if vy > 0.02:
                                return "dunk", 0.94

        # 2. Three Pointer
        # High arc trajectory starting from deep wings (x < 0.3 or x > 0.7) and landing in hoop region
        if ball_pos:
            for hoop in self.hoop_coords:
                if self._calculate_distance(ball_pos, hoop) < 0.08:
                    # Check start position of shot
                    start_pos = next((x for x in self.ball_pos_history[-25:] if x is not None), None)
                    if start_pos and (start_pos[0] < 0.35 or start_pos[0] > 0.65):
                        # High peak check
                        y_coords = [p[1] for p in self.ball_pos_history[-25:] if p]
                        if y_coords and min(y_coords) < 0.20: # Trajectory rose high (y normalized is smaller at the top)
                            return "three_pointer", 0.91

        # 3. Steal
        # Ball possession changes rapidly with high speed motion
        if events_flag.get("impact") and len(players) >= 2:
            # Check if possession shifted between player tracks
            if len(self.frame_history) > 5:
                prev_possessor = None
                for f in reversed(self.frame_history[-10:-1]):
                    f_ball = f.get("ball_data", {}).get("ball_position")
                    f_players = [t for t in f.get("tracking", []) if t.get("category") == "person"]
                    if f_ball and f_players:
                        dists = [self._calculate_distance(self._get_bbox_center(p["bbox"]), f_ball) for p in f_players]
                        if min(dists) < 0.08:
                            prev_possessor = f_players[np.argmin(dists)].get("track_id")
                            break
                if ball_pos:
                    dists = [self._calculate_distance(self._get_bbox_center(p["bbox"]), ball_pos) for p in players]
                    current_possessor = players[np.argmin(dists)].get("track_id") if min(dists) < 0.08 else None
                    if prev_possessor and current_possessor and prev_possessor != current_possessor:
                        # Ensure it was a quick steal (motion/acceleration high)
                        if motion.get("magnitude", 0.0) > 0.02 or events_flag.get("impact_type") == "bounce/direction_change":
                            return "steal", 0.88

        # 4. Celebration
        # Player clustering after scoring
        if len(players) >= 2:
            centroids = [self._get_bbox_center(p["bbox"]) for p in players]
            pair_dists = []
            for i in range(len(centroids)):
                for j in range(i+1, len(centroids)):
                    pair_dists.append(self._calculate_distance(centroids[i], centroids[j]))
            if pair_dists and np.mean(pair_dists) < 0.12:
                # Was there a recent score (dunk or three pointer)?
                recent_score = False
                for f in self.frame_history[-90:]:
                    f_ball = f.get("ball_data", {})
                    if f_ball:
                        # If ball passed hoop
                        f_pos = f_ball.get("ball_position")
                        if f_pos:
                            for hoop in self.hoop_coords:
                                if self._calculate_distance(f_pos, hoop) < 0.08:
                                    recent_score = True
                                    break
                    if recent_score:
                        break
                if recent_score:
                    return "celebration", 0.90

        # 5. Pass
        if events_flag.get("anticipated_pass") and events_flag.get("impact"):
            return "pass", 0.86

        return "action", 0.50

    def process_timeline(self, timeline_data):
        results = []
        for entry in timeline_data:
            frame_idx = entry.get("frame_idx", 0)
            audio = entry.get("audio", {})
            motion = entry.get("motion", {})
            tracking = entry.get("tracking", [])
            ball_data = entry.get("ball_data", {})
            
            res = self.process_frame(frame_idx, audio, motion, tracking, ball_data)
            results.append({
                "frame": entry.get("frame"),
                "event_intelligence": res
            })
        return results

def main():
    parser = argparse.ArgumentParser(description="Multimodal Event Detection Engine")
    parser.add_argument("--input-json", required=True, help="Path to input tracks + multimodal features JSON")
    parser.add_argument("--output-json", required=True, help="Path to write event intelligence results")
    parser.add_argument("--sport", default="football", choices=["football", "basketball"], help="Sport type")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        timeline = data.get("results", []) if isinstance(data, dict) else data
        
        engine = MultimodalEventEngine(sport=args.sport)
        results = engine.process_timeline(timeline)

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
