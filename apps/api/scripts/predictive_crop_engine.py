import os
import sys
import json
import argparse
import numpy as np

class AccelerationKalmanFilter:
    """
    Constant-acceleration Kalman Filter to track state: [px, py, vx, vy, ax, ay]^T
    """
    def __init__(self):
        # State transition matrix F (6x6)
        self.F = np.array([
            [1.0, 0.0, 1.0, 0.0, 0.5, 0.0],
            [0.0, 1.0, 0.0, 1.0, 0.0, 0.5],
            [0.0, 0.0, 1.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 1.0, 0.0, 1.0],
            [0.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            [0.0, 0.0, 0.0, 0.0, 0.0, 1.0]
        ], dtype=np.float32)
        
        # Measurement matrix H (2x6) (observes position px, py)
        self.H = np.array([
            [1.0, 0.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0, 0.0]
        ], dtype=np.float32)
        
        # Process noise covariance
        self.Q = np.eye(6, dtype=np.float32) * 0.02
        # Measurement noise covariance
        self.R = np.eye(2, dtype=np.float32) * 0.05
        
        self.mean = None
        self.covariance = None

    def initiate(self, measurement):
        self.mean = np.zeros(6, dtype=np.float32)
        self.mean[0] = measurement[0]
        self.mean[1] = measurement[1]
        self.covariance = np.eye(6, dtype=np.float32) * 5.0

    def predict(self):
        self.mean = np.dot(self.F, self.mean)
        self.covariance = np.dot(self.F, np.dot(self.covariance, self.F.T)) + self.Q

    def update(self, measurement):
        projected_mean = np.dot(self.H, self.mean)
        projected_cov = np.dot(self.H, np.dot(self.covariance, self.H.T)) + self.R
        
        B = np.dot(self.covariance, self.H.T)
        try:
            kalman_gain = np.linalg.solve(projected_cov, B.T).T
        except np.linalg.LinAlgError:
            kalman_gain = np.dot(B, np.linalg.pinv(projected_cov))
            
        innovation = measurement - projected_mean
        self.mean = self.mean + np.dot(kalman_gain, innovation)
        self.covariance = self.covariance - np.dot(kalman_gain, B.T)

class PredictiveCropEngine:
    def __init__(self, W=1920, H=1080, default_lookahead=8, max_lookahead=15):
        self.W = W
        self.H = H
        self.default_lookahead = default_lookahead
        self.max_lookahead = max_lookahead
        
        # Track Kalman filters (mapping track_id to AccelerationKalmanFilter)
        self.filters = {}

    def predict_track_position(self, track_id, bbox, frame_idx):
        """
        Updates target states and predicts future positions with sports-optimized look-ahead.
        """
        # Bbox center
        c_x = (bbox[0] + bbox[2]) / 2.0
        c_y = (bbox[1] + bbox[3]) / 2.0
        
        measurement = np.array([c_x, c_y], dtype=np.float32)
        
        # Initialize filter if track is new
        if track_id not in self.filters:
            self.filters[track_id] = AccelerationKalmanFilter()
            self.filters[track_id].initiate(measurement)
            
        kf = self.filters[track_id]
        
        # Predict state transition & update measurement
        kf.predict()
        kf.update(measurement)
        
        # Extract estimated kinematics
        px, py, vx, vy, ax, ay = kf.mean
        
        # Sports Lead-In Optimization
        # Acceleration spikes expand look-ahead intervals to keep the camera ahead of the action
        acc_mag = np.sqrt(ax**2 + ay**2)
        
        # Dynamic lookahead steps based on acceleration
        lookahead = int(np.clip(self.default_lookahead + acc_mag * 150.0, 3.0, self.max_lookahead))
        
        # Project future position
        pred_cx = px + vx * lookahead + 0.5 * ax * (lookahead ** 2)
        pred_cy = py + vy * lookahead + 0.5 * ay * (lookahead ** 2)
        
        # Keep predictions inside frame bounds [0.0, 1.0]
        pred_cx = float(np.clip(pred_cx, 0.0, 1.0))
        pred_cy = float(np.clip(pred_cy, 0.0, 1.0))

        # Re-derive bounding box dimensions from original bbox
        w_box = bbox[2] - bbox[0]
        h_box = bbox[3] - bbox[1]
        
        pred_bbox = [
            round(pred_cx - w_box / 2.0, 4),
            round(pred_cy - h_box / 2.0, 4),
            round(pred_cx + w_box / 2.0, 4),
            round(pred_cy + h_box / 2.0, 4)
        ]
        
        # Clamp coordinates within bounds
        pred_bbox[0] = max(0.0, pred_bbox[0])
        pred_bbox[1] = max(0.0, pred_bbox[1])
        pred_bbox[2] = min(1.0, pred_bbox[2])
        pred_bbox[3] = min(1.0, pred_bbox[3])

        return {
            "track_id": track_id,
            "current_bbox": bbox,
            "predicted_bbox": pred_bbox,
            "predicted_center": [round(pred_cx, 4), round(pred_cy, 4)],
            "velocity": [round(float(vx), 4), round(float(vy), 4)],
            "acceleration": [round(float(ax), 4), round(float(ay), 4)],
            "lookahead_frames": lookahead
        }

    def process_timeline(self, frames_tracks):
        results = []
        for idx, entry in enumerate(frames_tracks):
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            predicted_tracks = []
            for t in tracks:
                track_id = t["track_id"]
                bbox = t["bbox"]
                
                pred_data = self.predict_track_position(track_id, bbox, idx)
                predicted_tracks.append(pred_data)
                
            results.append({
                "frame": frame_name,
                "tracks": predicted_tracks
            })
        return results

def main():
    parser = argparse.ArgumentParser(description="Predictive Video Cropping & Kinematic Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write predicted tracks output")
    parser.add_argument("--lookahead", type=int, default=8, help="Default look-ahead frames count")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        
        engine = PredictiveCropEngine(default_lookahead=args.lookahead)
        predicted_results = engine.process_timeline(frames_tracks)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": predicted_results}, f, indent=2)

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
