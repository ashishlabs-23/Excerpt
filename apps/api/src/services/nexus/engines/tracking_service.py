import os
import sys
import json
import argparse
import numpy as np

class KalmanFilter:
    """
    Constant velocity Kalman filter to track bounding box coordinates [cx, cy, a, h].
    """
    def __init__(self):
        # State transition matrix
        self._motion_mat = np.eye(8)
        for i in range(4):
            self._motion_mat[i, i + 4] = 1.0
            
        # Measurement matrix
        self._update_mat = np.zeros((4, 8))
        for i in range(4):
            self._update_mat[i, i] = 1.0
            
        self._std_weight_position = 1.0 / 20
        self._std_weight_velocity = 1.0 / 160

    def initiate(self, measurement):
        mean_pos = measurement
        mean_vel = np.zeros(4)
        mean = np.r_[mean_pos, mean_vel]

        std = [
            2 * self._std_weight_position * measurement[3],
            2 * self._std_weight_position * measurement[3],
            1e-2,
            2 * self._std_weight_position * measurement[3],
            10 * self._std_weight_velocity * measurement[3],
            10 * self._std_weight_velocity * measurement[3],
            1e-5,
            10 * self._std_weight_velocity * measurement[3]
        ]
        covariance = np.diag(np.square(std))
        return mean, covariance

    def predict(self, mean, covariance):
        std_pos = [
            self._std_weight_position * mean[3],
            self._std_weight_position * mean[3],
            1e-2,
            self._std_weight_position * mean[3]
        ]
        std_vel = [
            self._std_weight_velocity * mean[3],
            self._std_weight_velocity * mean[3],
            1e-5,
            self._std_weight_velocity * mean[3]
        ]
        motion_cov = np.diag(np.square(np.r_[std_pos, std_vel]))

        mean = np.dot(self._motion_mat, mean)
        covariance = np.dot(self._motion_mat, np.dot(covariance, self._motion_mat.T)) + motion_cov
        return mean, covariance

    def project(self, mean, covariance):
        std = [
            self._std_weight_position * mean[3],
            self._std_weight_position * mean[3],
            1e-2,
            self._std_weight_position * mean[3]
        ]
        measurement_cov = np.diag(np.square(std))

        mean = np.dot(self._update_mat, mean)
        covariance = np.dot(self._update_mat, np.dot(covariance, self._update_mat.T)) + measurement_cov
        return mean, covariance

    def update(self, mean, covariance, measurement):
        projected_mean, projected_cov = self.project(mean, covariance)
        
        B = np.dot(covariance, self._update_mat.T)
        try:
            kalman_gain = np.linalg.solve(projected_cov, B.T).T
        except np.linalg.LinAlgError:
            kalman_gain = np.dot(B, np.linalg.pinv(projected_cov))
            
        innovation = measurement - projected_mean
        new_mean = mean + np.dot(kalman_gain, innovation)
        new_covariance = covariance - np.dot(kalman_gain, B.T)
        return new_mean, new_covariance

def get_camera_pan_offset(camera_movement):
    if not camera_movement:
        return 0.0, 0.0
    event = camera_movement.get("event", "Static")
    mag = camera_movement.get("magnitude", 0.0)
    dx, dy = 0.0, 0.0
    if "Right" in event:
        dx = mag / 320.0
    elif "Left" in event:
        dx = -mag / 320.0
    
    if "Down" in event:
        dy = mag / 180.0
    elif "Up" in event:
        dy = -mag / 180.0
    return dx, dy

class STrack:
    """
    Single track representation with state and prediction history.
    """
    _track_id_counter = 0

    def __init__(self, bbox, score, category="person"):
        STrack._track_id_counter += 1
        self.track_id = STrack._track_id_counter
        self.bbox = bbox  # [x1, y1, x2, y2]
        self.score = score
        self.category = category
        self.state = "tracked"  # "tracked", "lost", "removed"
        self.history = [bbox]
        
        self.kalman = KalmanFilter()
        z = self.bbox_to_z(bbox)
        self.mean, self.covariance = self.kalman.initiate(z)
        
        self.time_since_update = 0
        self.frame_id = 0
        self.velocity = [0.0, 0.0]

    @staticmethod
    def bbox_to_z(bbox):
        x1, y1, x2, y2 = bbox
        w = x2 - x1
        h = y2 - y1
        cx = x1 + w / 2.0
        cy = y1 + h / 2.0
        a = w / h if h > 0 else 0.0
        return np.array([cx, cy, a, h], dtype=np.float32)

    def z_to_bbox(self, z):
        cx, cy, a, h = z
        w = a * h
        x1 = cx - w / 2.0
        y1 = cy - h / 2.0
        x2 = cx + w / 2.0
        y2 = cy + h / 2.0
        return [float(x1), float(y1), float(x2), float(y2)]

    def predict(self, camera_movement=None):
        self.mean, self.covariance = self.kalman.predict(self.mean, self.covariance)
        self.time_since_update += 1
        if camera_movement:
            dx, dy = get_camera_pan_offset(camera_movement)
            self.mean[0] += dx
            self.mean[1] += dy
        self.bbox = self.z_to_bbox(self.mean[:4])

    def update(self, new_detection, frame_id):
        self.frame_id = frame_id
        self.category = new_detection.get("category", "person")
        old_center = [(self.history[-1][0] + self.history[-1][2])/2, (self.history[-1][1] + self.history[-1][3])/2]
        new_bbox = new_detection["bbox"]
        new_center = [(new_bbox[0] + new_bbox[2])/2, (new_bbox[1] + new_bbox[3])/2]
        self.velocity = [new_center[0] - old_center[0], new_center[1] - old_center[1]]
        
        self.score = new_detection["confidence"]
        self.bbox = new_bbox
        self.history.append(new_bbox)
        if len(self.history) > 100:
            self.history.pop(0)
            
        z = self.bbox_to_z(new_bbox)
        self.mean, self.covariance = self.kalman.update(self.mean, self.covariance, z)
        self.time_since_update = 0
        self.state = "tracked"

    def mark_lost(self):
        self.state = "lost"

    def mark_removed(self):
        self.state = "removed"

def bbox_iou(box1, box2):
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])
    
    interArea = max(0, xB - xA) * max(0, yB - yA)
    box1Area = (box1[2] - box1[0]) * (box1[3] - box1[1])
    box2Area = (box2[2] - box2[0]) * (box2[3] - box2[1])
    
    unionArea = box1Area + box2Area - interArea
    if unionArea == 0:
        return 0.0
    return interArea / unionArea

def greedy_match(cost_matrix, threshold):
    num_tracks, num_dets = cost_matrix.shape
    if num_tracks == 0 or num_dets == 0:
        return [], list(range(num_tracks)), list(range(num_dets))
        
    matches = []
    for r in range(num_tracks):
        for c in range(num_dets):
            val = cost_matrix[r, c]
            if val >= threshold:
                matches.append((val, r, c))
                
    matches.sort(key=lambda x: x[0], reverse=True)
    
    matched_tracks = set()
    matched_dets = set()
    matched_pairs = []
    
    for val, r, c in matches:
        if r not in matched_tracks and c not in matched_dets:
            matched_tracks.add(r)
            matched_dets.add(c)
            matched_pairs.append((r, c))
            
    unmatched_tracks = [r for r in range(num_tracks) if r not in matched_tracks]
    unmatched_dets = [c for c in range(num_dets) if c not in matched_dets]
    
    return matched_pairs, unmatched_tracks, unmatched_dets

class ByteTracker:
    def __init__(self, high_threshold=0.6, low_threshold=0.1, match_threshold=0.2, max_lost_frames=30):
        self.high_threshold = high_threshold
        self.low_threshold = low_threshold
        self.match_threshold = match_threshold
        self.max_lost_frames = max_lost_frames
        
        self.tracked_stracks = []  # active tracks
        self.lost_stracks = []     # lost tracks
        self.frame_id = 0

    def update(self, detections, camera_movement=None):
        self.frame_id += 1
        
        # Split detections based on confidence score
        detections_high = []
        detections_low = []
        
        for d in detections:
            conf = d.get("confidence", 0.0)
            if conf >= self.high_threshold:
                detections_high.append(d)
            elif conf >= self.low_threshold:
                detections_low.append(d)

        # 1. Predict state for all active/lost tracks with camera movement compensation
        all_tracks = self.tracked_stracks + self.lost_stracks
        for t in all_tracks:
            t.predict(camera_movement)

        # 2. First Association: match active tracks with high-confidence detections
        active_tracks = [t for t in self.tracked_stracks]
        cost_matrix_1 = np.zeros((len(active_tracks), len(detections_high)))
        for r, t in enumerate(active_tracks):
            for c, d in enumerate(detections_high):
                cost_matrix_1[r, c] = bbox_iou(t.bbox, d["bbox"])
                
        matches_1, unmatched_tracks_1, unmatched_dets_high = greedy_match(cost_matrix_1, self.match_threshold)
        
        matched_tracks = []
        for r, c in matches_1:
            active_tracks[r].update(detections_high[c], self.frame_id)
            matched_tracks.append(active_tracks[r])

        # 3. Second Association: match remaining active tracks with low-confidence detections
        unmatched_active_tracks = [active_tracks[i] for i in unmatched_tracks_1]
        cost_matrix_2 = np.zeros((len(unmatched_active_tracks), len(detections_low)))
        for r, t in enumerate(unmatched_active_tracks):
            for c, d in enumerate(detections_low):
                cost_matrix_2[r, c] = bbox_iou(t.bbox, d["bbox"])
                
        matches_2, unmatched_tracks_2, _ = greedy_match(cost_matrix_2, self.match_threshold)
        
        for r, c in matches_2:
            unmatched_active_tracks[r].update(detections_low[c], self.frame_id)
            matched_tracks.append(unmatched_active_tracks[r])

        # Tracks that remain unmatched after association 1 & 2 are marked lost
        remaining_unmatched_active = [unmatched_active_tracks[i] for i in unmatched_tracks_2]
        for t in remaining_unmatched_active:
            t.mark_lost()
            if t not in self.lost_stracks:
                self.lost_stracks.append(t)

        # 4. Third Association: match lost tracks with remaining high-confidence detections
        unmatched_high_dets = [detections_high[i] for i in unmatched_dets_high]
        cost_matrix_3 = np.zeros((len(self.lost_stracks), len(unmatched_high_dets)))
        for r, t in enumerate(self.lost_stracks):
            for c, d in enumerate(unmatched_high_dets):
                cost_matrix_3[r, c] = bbox_iou(t.bbox, d["bbox"])
                
        matches_3, unmatched_lost_idx, unmatched_dets_final_idx = greedy_match(cost_matrix_3, self.match_threshold)
        
        for r, c in matches_3:
            t = self.lost_stracks[r]
            t.update(unmatched_high_dets[c], self.frame_id)
            matched_tracks.append(t)

        # Remove long-lost tracks
        remaining_lost_tracks = []
        for i in unmatched_lost_idx:
            t = self.lost_stracks[i]
            if self.frame_id - t.frame_id > self.max_lost_frames:
                t.mark_removed()
            else:
                remaining_lost_tracks.append(t)
        self.lost_stracks = remaining_lost_tracks

        # 5. Initialize new tracks from unmatched high-confidence detections
        final_unmatched_high_dets = [unmatched_high_dets[i] for i in unmatched_dets_final_idx]
        for d in final_unmatched_high_dets:
            new_track = STrack(d["bbox"], d["confidence"], d.get("category", "person"))
            new_track.frame_id = self.frame_id
            matched_tracks.append(new_track)

        self.tracked_stracks = [t for t in matched_tracks if t.state == "tracked"]
        
        # Build tracking results output
        results = []
        added_ids = set()
        
        # Include active tracks
        for t in self.tracked_stracks:
            if t.track_id not in added_ids:
                results.append({
                    "track_id": t.track_id,
                    "bbox": [round(c, 4) for c in t.bbox],
                    "velocity": [round(v, 4) for v in t.velocity],
                    "confidence": round(t.score, 4),
                    "category": t.category
                })
                added_ids.add(t.track_id)
                
        # Include recently lost tracks (t.time_since_update <= 12)
        for t in self.lost_stracks:
            if t.time_since_update <= 12 and t.track_id not in added_ids:
                results.append({
                    "track_id": t.track_id,
                    "bbox": [round(c, 4) for c in t.bbox],
                    "velocity": [round(v, 4) for v in t.velocity],
                    "confidence": round(t.score, 4),
                    "category": t.category
                })
                added_ids.add(t.track_id)
                
        return results

def extract_frame_idx(frame_name):
    if isinstance(frame_name, int):
        return frame_name
    if not frame_name:
        return 0
    import re
    match = re.search(r'\d+', os.path.basename(frame_name))
    return int(match.group(0)) if match else 0

def main():
    parser = argparse.ArgumentParser(description="ByteTrack Object Tracking Service")
    parser.add_argument("--input-json", required=True, help="Path to JSON file containing YOLO detections per frame")
    parser.add_argument("--output-json", required=True, help="Path to write compiled tracking results")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        # Support array format or nested results
        if isinstance(data, dict) and "detection_results" in data:
            frames_data = data["detection_results"].get("results", [])
        elif isinstance(data, dict) and "results" in data:
            frames_data = data["results"]
        else:
            frames_data = data if isinstance(data, list) else []
            
        # Parse motion results if available
        motion_map = {}
        if isinstance(data, dict) and "motion_results" in data:
            motion_list = data["motion_results"].get("results", [])
            for entry in motion_list:
                m_frame = entry.get("frame")
                if m_frame is not None:
                    motion_map[extract_frame_idx(m_frame)] = entry

        tracker = ByteTracker()
        output_results = []

        for frame_entry in frames_data:
            frame_name = frame_entry.get("frame")
            detections = frame_entry.get("detections", [])
            
            # Format boxes properly for tracking
            tracker_input = []
            for det in detections:
                tracker_input.append({
                    "bbox": det["bbox"],
                    "confidence": det["confidence"],
                    "category": det.get("class", "person")
                })
            
            # Retrieve camera movement for this frame
            frame_idx = extract_frame_idx(frame_name)
            camera_movement = None
            if frame_idx in motion_map:
                camera_movement = motion_map[frame_idx].get("camera_movement")
                
            tracks = tracker.update(tracker_input, camera_movement)
            output_results.append({
                "frame": frame_name,
                "tracks": tracks
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
