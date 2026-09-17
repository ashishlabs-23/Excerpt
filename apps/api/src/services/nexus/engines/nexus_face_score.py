import cv2
import sys
import json
import os
from pathlib import Path

def get_face_score(video_path):
    # Try multiple cascade locations
    cascade_paths = [
        os.environ.get("OPENCV_FACE_CASCADE"),
        "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
        "/opt/opencv-data/haarcascade_frontalface_default.xml",
        "haarcascade_frontalface_default.xml"
    ]
    
    cascade_path = None
    for p in cascade_paths:
        if p and Path(p).exists():
            cascade_path = p
            break
            
    if not cascade_path:
        return 0.0, "Cascade not found"

    face_cascade = cv2.CascadeClassifier(cascade_path)
    cap = cv2.VideoCapture(video_path)
    
    if not cap.isOpened():
        return 0.0, "Video not opened"

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    # Sample up to 10 frames across the clip
    sample_count = min(10, total_frames)
    if sample_count <= 0: return 0.0, "No frames"
    
    faces_found = 0
    confidences = []

    for i in range(sample_count):
        pos = int((total_frames / sample_count) * i)
        cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
        ret, frame = cap.read()
        if not ret: continue
        
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, 1.1, 4)
        
        if len(faces) > 0:
            faces_found += 1
            # Simple confidence based on area
            best_face = max(faces, key=lambda f: f[2]*f[3])
            area_ratio = (best_face[2]*best_face[3]) / (frame.shape[0]*frame.shape[1])
            confidences.append(area_ratio)

    cap.release()
    
    found_ratio = faces_found / sample_count
    avg_area = sum(confidences) / len(confidences) if confidences else 0
    
    # Final score: mix of "is there a person?" and "is the person prominent?"
    score = (found_ratio * 0.7) + (min(1.0, avg_area * 10) * 0.3)
    return round(score, 4), f"Found in {faces_found}/{sample_count} samples"

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"score": 0, "error": "No path"}))
        sys.exit(1)
        
    video_path = sys.argv[1]
    score, reason = get_face_score(video_path)
    print(json.dumps({"score": score, "reason": reason}))
