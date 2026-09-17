import os
import sys
import json
import argparse
import numpy as np

class SubjectPriorityEngine:
    def __init__(self, weights=None):
        # Default sub-score weights
        self.weights = weights or {
            "face": 0.25,
            "speech": 0.35,
            "motion": 0.15,
            "position": 0.15,
            "importance": 0.10
        }
        # Class category importance weights
        self.category_weights = {
            "person": 1.0,
            "face": 0.9,
            "sports ball": 0.8,
            "screen": 0.5,
            "whiteboard": 0.5,
            "laptop": 0.4,
            "phone": 0.3
        }
        # Dynamic mapping to match track_id to speaker label (A, B, C...)
        # Structure: track_votes[track_id][speaker] = vote_count
        self.track_votes = {}
        self.track_to_speaker = {}

    def _associate_faces_with_tracks(self, tracks):
        """
        Associates face boxes with person tracks based on spatial overlap/inclusion.
        """
        person_tracks = [t for t in tracks if t.get("category", "person") == "person"]
        face_tracks = [t for t in tracks if t.get("category") == "face"]
        
        association = {}
        for face in face_tracks:
            fb = face["bbox"]
            fc_x = (fb[0] + fb[2]) / 2.0
            fc_y = (fb[1] + fb[3]) / 2.0
            
            best_person = None
            min_dist = float("inf")
            for person in person_tracks:
                pb = person["bbox"]
                # Check if face center is inside person bbox
                if pb[0] <= fc_x <= pb[2] and pb[1] <= fc_y <= pb[3]:
                    pc_x = (pb[0] + pb[2]) / 2.0
                    pc_y = (pb[1] + pb[3]) / 2.0
                    dist = np.sqrt((fc_x - pc_x)**2 + (fc_y - pc_y)**2)
                    if dist < min_dist:
                        min_dist = dist
                        best_person = person["track_id"]
            if best_person:
                association[best_person] = face
                
        return association

    def update_speaker_mapping(self, tracks, active_speaker):
        """
        Updates dynamic track-to-speaker mappings. If speaker X is talking,
        and track Y has the largest face / movement, increment speaker votes for track Y.
        """
        if not active_speaker:
            return

        person_tracks = [t for t in tracks if t.get("category", "person") == "person"]
        if not person_tracks:
            return

        # Find the person track closest to center or with active velocity
        best_track_id = None
        min_center_dist = float("inf")
        
        for t in person_tracks:
            bbox = t["bbox"]
            c_x = (bbox[0] + bbox[2]) / 2.0
            c_y = (bbox[1] + bbox[3]) / 2.0
            dist = np.sqrt((c_x - 0.5)**2 + (c_y - 0.5)**2)
            if dist < min_center_dist:
                min_center_dist = dist
                best_track_id = t["track_id"]

        if best_track_id is not None:
            if best_track_id not in self.track_votes:
                self.track_votes[best_track_id] = {}
            self.track_votes[best_track_id][active_speaker] = self.track_votes[best_track_id].get(active_speaker, 0) + 1

            # Update speaker mapping based on highest votes
            for tid, votes in self.track_votes.items():
                best_spk = max(votes, key=votes.get)
                self.track_to_speaker[tid] = best_spk

    def calculate_priority(self, tracks, active_speaker, active_text=None):
        """
        Calculates priority score for all active tracks in a frame.
        """
        self.update_speaker_mapping(tracks, active_speaker)
        associated_faces = self._associate_faces_with_tracks(tracks)
        
        priority_results = []
        for t in tracks:
            # Skip separate faces to avoid double scoring
            if t.get("category") == "face":
                continue
                
            track_id = t["track_id"]
            bbox = t["bbox"]
            vel = t.get("velocity", [0.0, 0.0])
            conf = t.get("confidence", 1.0)
            category = t.get("category", "person")
            
            # 1. Face Size Score (relative area of face inside bbox)
            s_face = 0.0
            face_associated = associated_faces.get(track_id)
            if face_associated:
                fb = face_associated["bbox"]
                face_area = (fb[2] - fb[0]) * (fb[3] - fb[1])
                s_face = min(1.0, face_area / 0.15)
                
            # 2. Speaking Score (matches current active speaker timeline)
            s_speech = 0.0
            mapped_spk = self.track_to_speaker.get(track_id)
            if active_speaker and mapped_spk == active_speaker:
                s_speech = 1.0
                
            # 3. Motion Score (velocity magnitude scale)
            vel_mag = np.sqrt(vel[0]**2 + vel[1]**2)
            s_motion = float(np.tanh(vel_mag * 10.0))
            
            # 4. Screen Position Score (spatial centering)
            c_x = (bbox[0] + bbox[2]) / 2.0
            c_y = (bbox[1] + bbox[3]) / 2.0
            dist_to_center = np.sqrt((c_x - 0.5)**2 + (c_y - 0.5)**2)
            max_dist = np.sqrt(0.5**2 + 0.5**2)
            s_pos = max(0.0, 1.0 - (dist_to_center / max_dist))
            
            # 5. Visual Importance Score (category weight * confidence)
            cat_weight = self.category_weights.get(category, 0.5)
            
            # Boost weight based on transcript keywords matching the category
            if active_text:
                if category == "screen" and any(k in active_text for k in ["screen", "slide", "presentation", "monitor", "display", "dashboard"]):
                    cat_weight = min(0.95, cat_weight + 0.4)
                elif category == "whiteboard" and any(k in active_text for k in ["whiteboard", "board", "marker", "draw", "diagram", "write", "sketch"]):
                    cat_weight = min(0.95, cat_weight + 0.4)
                elif category == "laptop" and any(k in active_text for k in ["laptop", "computer", "macbook", "keyboard", "code", "coding", "programming", "terminal", "ide"]):
                    cat_weight = min(0.95, cat_weight + 0.4)
                elif category == "phone" and any(k in active_text for k in ["phone", "mobile", "cellphone", "iphone", "android", "device"]):
                    cat_weight = min(0.95, cat_weight + 0.4)
                    
            s_importance = cat_weight * conf
            
            # Weighted Priority Score
            priority_score = (
                self.weights["face"] * s_face +
                self.weights["speech"] * s_speech +
                self.weights["motion"] * s_motion +
                self.weights["position"] * s_pos +
                self.weights["importance"] * s_importance
            )
            
            priority_results.append({
                "track_id": track_id,
                "category": category,
                "bbox": bbox,
                "priority_score": round(priority_score, 4),
                "breakdown": {
                    "face_size": round(s_face, 3),
                    "speaking": round(s_speech, 3),
                    "motion": round(s_motion, 3),
                    "position": round(s_pos, 3),
                    "importance": round(s_importance, 3)
                }
            })
            
        # Sort by priority score descending
        priority_results.sort(key=lambda x: x["priority_score"], reverse=True)
        return priority_results

def main():
    parser = argparse.ArgumentParser(description="Multimodal Subject Priority Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--timeline-json", required=True, help="Path to active speaker timeline JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write priority scores output")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            tracks_data = json.load(f)
        with open(args.timeline_json, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)

        timeline = timeline_data.get("timeline", [])
        frames_tracks = tracks_data.get("results", [])

        engine = SubjectPriorityEngine()
        output_results = []

        # Process each frame
        for frame_idx, frame_entry in enumerate(frames_tracks):
            frame_name = frame_entry.get("frame")
            tracks = frame_entry.get("tracks", [])
            
            # Calculate current frame timestamp
            # Standard assumption: 30 FPS if not specified
            frame_time = frame_idx / 30.0
            
            # Find active speaker & transcript text at this timestamp
            active_speaker = None
            active_text = None
            for segment in timeline:
                if segment["start"] <= frame_time <= segment["end"]:
                    active_speaker = segment["speaker"]
                    break
                    
            segments = tracks_data.get("segments", [])
            for seg in segments:
                if seg["start"] <= frame_time <= seg["end"]:
                    active_text = seg.get("text", "").lower()
                    break
                    
            priorities = engine.calculate_priority(tracks, active_speaker, active_text)
            output_results.append({
                "frame": frame_name,
                "time": round(frame_time, 3),
                "active_speaker": active_speaker,
                "priorities": priorities
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
