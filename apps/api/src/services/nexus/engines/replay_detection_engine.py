import os
import sys
import json
import argparse
import numpy as np

class ReplayDetectionEngine:
    def __init__(self, fps=30):
        self.fps = fps
        self.long_term_speed_history = []
        self.frame_history = []
        
        # Sliding buffer of coordinate sequences for repeated action detection
        self.trajectory_buffer = [] # Holds lists of past trajectory sequences

    def _get_bbox_center(self, bbox):
        return [(bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0]

    def _correlate_trajectories(self, t1, t2):
        """
        Calculates correlation score between two coordinate paths of equal length.
        """
        if len(t1) != len(t2) or len(t1) < 5:
            return 0.0
            
        p1 = np.array(t1)
        p2 = np.array(t2)
        
        # Zero-center paths
        p1_centered = p1 - np.mean(p1, axis=0)
        p2_centered = p2 - np.mean(p2, axis=0)
        
        # Compute normalized correlation
        num = np.sum(p1_centered * p2_centered)
        denom = np.sqrt(np.sum(p1_centered**2) * np.sum(p2_centered**2))
        
        if denom > 0:
            return float(num / denom)
        return 0.0

    def process_timeline(self, timeline):
        """
        Runs frame-by-frame analysis over the timeline to isolate replay boundaries.
        """
        replay_flagged_frames = []
        
        # We process frame velocities to establish a baseline speed
        all_speeds = []
        for idx, frame in enumerate(timeline):
            # Compute tracking velocity magnitude
            tracks = frame.get("tracking", [])
            ball_track = next((t for t in tracks if t.get("category") == "sports ball"), None)
            
            speed = 0.0
            if ball_track and idx > 0:
                prev_tracks = timeline[idx-1].get("tracking", [])
                prev_ball = next((t for t in prev_tracks if t.get("category") == "sports ball"), None)
                if prev_ball:
                    c1 = self._get_bbox_center(ball_track["bbox"])
                    c2 = self._get_bbox_center(prev_ball["bbox"])
                    speed = np.sqrt((c1[0] - c2[0])**2 + (c1[1] - c2[1])**2)
            all_speeds.append(speed)
            
        # Filter zero speeds to compute baseline speed
        valid_speeds = [s for s in all_speeds if s > 0.001]
        baseline_speed = np.mean(valid_speeds) if valid_speeds else 0.02

        # Main detection pass
        for idx, frame in enumerate(timeline):
            timestamp = frame.get("timestamp", idx / self.fps)
            visual = frame.get("visual", {})
            motion = frame.get("motion", {})
            tracks = frame.get("tracking", [])
            
            # 1. Slow Motion Check
            is_slow_mo = False
            current_speed = all_speeds[idx]
            
            if current_speed > 0.0005 and current_speed / baseline_speed < 0.45:
                is_slow_mo = True
            elif motion.get("slow_motion_score", 0.0) > 0.70:
                is_slow_mo = True

            # 2. Broadcast Transitions & Logos
            is_transition = False
            if visual.get("logo_overlay_detected") or visual.get("graphic_transition_active"):
                is_transition = True
            elif motion.get("magnitude", 0.0) > 0.08: # Sudden huge global motion spike (whip pan / wipe)
                is_transition = True

            # 3. Repeated Action Check
            is_repeated = False
            # Get latest trajectory sequence of ball
            ball_track = next((t for t in tracks if t.get("category") == "sports ball"), None)
            if ball_track:
                # Get current sequence of last 10 frames
                current_seq = []
                for f_idx in range(max(0, idx - 10), idx + 1):
                    f_tracks = timeline[f_idx].get("tracking", [])
                    f_ball = next((t for t in f_tracks if t.get("category") == "sports ball"), None)
                    if f_ball:
                        current_seq.append(self._get_bbox_center(f_ball["bbox"]))
                
                if len(current_seq) >= 8:
                    # Compare to older segments
                    for past_seq in self.trajectory_buffer:
                        if len(past_seq) == len(current_seq):
                            corr = self._correlate_trajectories(current_seq, past_seq)
                            if corr > 0.82: # High path correlation
                                is_repeated = True
                                break
                    # Store current sequence as a past trajectory candidate
                    if idx % 15 == 0:
                        self.trajectory_buffer.append(current_seq)
                        if len(self.trajectory_buffer) > 20:
                            self.trajectory_buffer.pop(0)

            # Decide if frame is in replay
            in_replay = is_slow_mo or is_transition or is_repeated
            
            replay_flagged_frames.append({
                "timestamp": timestamp,
                "in_replay": in_replay,
                "is_transition": is_transition
            })

        # Step 4: Group flagged frames into discrete [start, end] intervals
        replay_intervals = []
        in_interval = False
        start_time = None
        
        # Temporal smoothing: bridge gaps shorter than 1.5 seconds
        smoothed_flags = []
        window_size = int(1.5 * self.fps)
        for i in range(len(replay_flagged_frames)):
            # If any frame within window is flagged, or neighbors are flagged
            start_w = max(0, i - window_size // 2)
            end_w = min(len(replay_flagged_frames), i + window_size // 2)
            subset = replay_flagged_frames[start_w:end_w]
            flag_count = sum(1 for f in subset if f["in_replay"])
            smoothed_flags.append(flag_count > (len(subset) * 0.25))

        for idx, flagged in enumerate(smoothed_flags):
            t = replay_flagged_frames[idx]["timestamp"]
            
            if flagged and not in_interval:
                in_interval = True
                start_time = t
            elif not flagged and in_interval:
                in_interval = False
                end_time = t
                if end_time - start_time > 2.0: # Minimum replay interval duration 2s
                    replay_intervals.append({
                        "replay": True,
                        "start": round(float(start_time), 2),
                        "end": round(float(end_time), 2)
                    })

        if in_interval:
            end_time = replay_flagged_frames[-1]["timestamp"]
            if end_time - start_time > 2.0:
                replay_intervals.append({
                    "replay": True,
                    "start": round(float(start_time), 2),
                    "end": round(float(end_time), 2)
                })

        return replay_intervals

def main():
    parser = argparse.ArgumentParser(description="Broadcast Replay Sequence Detection Engine")
    parser.add_argument("--input-json", required=True, help="Path to input tracks + visual + motion JSON")
    parser.add_argument("--output-json", required=True, help="Path to write replay intervals output")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        timeline = data.get("results", []) if isinstance(data, dict) else data
        
        engine = ReplayDetectionEngine()
        results = engine.process_timeline(timeline)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "replays": results}, f, indent=2)

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
