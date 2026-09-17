import argparse
import json
from pathlib import Path
import os
import cv2
import numpy as np


def parse_args():
    parser = argparse.ArgumentParser(description="Detect face focus points for smart cropping.")
    parser.add_argument("--frames", required=True, help="Directory containing extracted frame images.")
    parser.add_argument("--duration", required=True, type=float, help="Clip duration in seconds.")
    parser.add_argument("--multi-entity", action="store_true", default=True, help="Enable saliency fusion for contextual objects.")
    return parser.parse_args()


def savitzky_golay(y, window_size, order, deriv=0, rate=1):
    """Smooth (and optionally differentiate) data with a Savitzky-Golay filter."""
    try:
        from math import factorial
        
        if window_size % 2 != 1 or window_size < 1:
            raise TypeError("window_size size must be a positive odd number")
        if window_size < order + 2:
            raise TypeError("window_size is too small for the polynomials order")
        
        order_range = range(order+1)
        half_window = (window_size -1) // 2
        
        # precompute coefficients
        b = np.mat([[k**i for i in order_range] for k in range(-half_window, half_window+1)])
        m = np.linalg.pinv(b).A[deriv] * rate**deriv * factorial(deriv)
        
        # pad the signal at the extremes with values taken from the signal itself
        firstvals = y[0] - np.abs( y[1:half_window+1][::-1] - y[0] )
        lastvals = y[-1] + np.abs( y[-half_window-1:-1][::-1] - y[-1] )
        y = np.concatenate((firstvals, y, lastvals))
        return np.convolve( m[::-1], y, mode='valid')
    except Exception as e:
        # Fallback to simple moving average if numpy/math operations fail
        print(f"SG Filter failed ({e}), falling back to MA", flush=True)
        return np.convolve(y, np.ones(window_size)/window_size, mode='same')


def detect_quadrilaterals(image):
    """Detects large rectangular/quadrilateral objects like whiteboards or pictures."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    quads = []
    height, width = image.shape[:2]
    min_area = (width * height) * 0.05 # At least 5% of frame
    
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue
            
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        
        if len(approx) == 4:
            x, y, w, h = cv2.boundingRect(approx)
            quads.append({
                'center': (x + w/2, y + h/2),
                'area': area,
                'bbox': (x, y, w, h)
            })
            
    return sorted(quads, key=lambda q: q['area'], reverse=True)


class FaceTracker:
    def __init__(self, max_faces=5):
        self.trackers = []
        self.max_faces = max_faces
        self.frame_count = 0

    def update(self, faces, gray_image):
        current_tracks = []
        for (x, y, w, h) in faces:
            # Mouth region: lower 40% of the face
            mouth_y = int(y + h * 0.6)
            mouth_h = int(h * 0.4)
            mouth_roi = gray_image[mouth_y:y+h, x:x+w]
            
            # Match with existing trackers
            best_match = None
            min_dist = 100
            for t in self.trackers:
                dist = np.sqrt(((x+w/2) - t['pos'][0])**2 + ((y+h/2) - t['pos'][1])**2)
                if dist < min_dist:
                    min_dist = dist
                    best_match = t
            
            activity = 0
            if best_match is not None:
                # Calculate activity: difference in mouth ROI
                prev_mouth = best_match['mouth_roi']
                if prev_mouth.shape == mouth_roi.shape:
                    diff = cv2.absdiff(mouth_roi, prev_mouth)
                    activity = np.mean(diff)
                
                # Update tracker
                best_match['pos'] = (x+w/2, y+h/2)
                best_match['bbox'] = (x, y, w, h)
                best_match['mouth_roi'] = mouth_roi
                best_match['activity'] = best_match['activity'] * 0.7 + activity * 0.3
                best_match['age'] = 0
                current_tracks.append(best_match)
                self.trackers.remove(best_match)
            else:
                current_tracks.append({
                    'pos': (x+w/2, y+h/2),
                    'bbox': (x, y, w, h),
                    'mouth_roi': mouth_roi,
                    'activity': 0,
                    'age': 0
                })

        # Keep track of missed faces for a few frames
        for t in self.trackers:
            t['age'] += 1
            if t['age'] < 5:
                current_tracks.append(t)
        
        self.trackers = current_tracks
        self.frame_count += 1
        
        if not self.trackers:
            return None
            
        # Select best face: combination of size and mouth activity
        # Score = (Area / MaxArea) * 0.4 + (Activity / MaxActivity) * 0.6
        max_area = max([t['bbox'][2] * t['bbox'][3] for t in self.trackers]) if self.trackers else 1
        max_activity = max([t['activity'] for t in self.trackers]) if self.trackers else 0.01
        
        def get_score(t):
            area = t['bbox'][2] * t['bbox'][3]
            # Boost score for larger faces and active mouths
            size_score = area / max_area
            act_score = t['activity'] / (max_activity + 0.001)
            return size_score * 0.4 + act_score * 0.6

        best_track = max(self.trackers, key=get_score)
        return best_track['bbox']


def detect_focus_points(frame_dir: Path, duration: float, multi_entity: bool = True):
    cascade_candidates = [
        os.environ.get("OPENCV_FACE_CASCADE"),
        "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
        "/usr/local/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
        "/opt/opencv-data/haarcascade_frontalface_default.xml",
        "/app/scripts/haarcascade_frontalface_default.xml",
    ]
    
    cascade_path = None
    for candidate in cascade_candidates:
        if not candidate: continue
        candidate_path = Path(candidate)
        if candidate_path.exists():
            cascade_path = candidate_path
            break
    
    if cascade_path is None:
        raise RuntimeError("Neural Anchor Failure: Unable to locate haarcascade_frontalface_default.xml")

    classifier = cv2.CascadeClassifier(str(cascade_path))
    frame_paths = sorted([p for p in frame_dir.iterdir() if p.suffix.lower() in {".pgm", ".png", ".jpg"}])

    if not frame_paths: return []

    # INITIALIZE HYBRID TRACKING
    kf = cv2.KalmanFilter(4, 2)
    kf.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
    kf.transitionMatrix = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)
    kf.processNoiseCov = np.array([[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]], np.float32) * 0.03
    
    tracker = FaceTracker()
    initialized_kf = False
    raw_x = []
    raw_y = []
    raw_confidences = []
    
    total_frames = max(1, len(frame_paths) - 1)

    for index, frame_path in enumerate(frame_paths):
        image = cv2.imread(str(frame_path))
        if image is None: 
            if initialized_kf:
                pred = kf.predict()
                raw_x.append(float(pred[0]))
                raw_y.append(float(pred[1]))
                raw_confidences.append(0.1)
            else:
                raw_x.append(0.5)
                raw_y.append(0.5)
                raw_confidences.append(0.0)
            continue
            
        height, width = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        faces = classifier.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))

        # Use the tracker to identify the active speaker
        best_face = tracker.update(faces, gray)

        if best_face is None:
            if initialized_kf:
                pred = kf.predict()
                raw_x.append(float(pred[0]))
                raw_y.append(float(pred[1]))
            else:
                raw_x.append(0.5)
                raw_y.append(0.5)
            raw_confidences.append(0.1)
            continue

        x, y, w, h = best_face
        
        # --- NEURAL SALIENCY BLENDING ---
        face_center_x = (x + w / 2.0) / width
        face_center_y = (y + h / 2.0) / height
        
        context_x, context_y = face_center_x, face_center_y
        context_weight = 0.0
        
        if multi_entity:
            quads = detect_quadrilaterals(image)
            if quads:
                best_quad = quads[0]
                qx, qy = best_quad['center']
                context_x, context_y = qx / width, qy / height
                dist = np.sqrt((context_x - face_center_x)**2 + (context_y - face_center_y)**2)
                if dist < 0.4:
                    context_weight = 0.3 * (best_quad['area'] / (width * height))
        
        target_x = face_center_x * (1.0 - context_weight) + context_x * context_weight
        target_y = face_center_y * (1.0 - context_weight) + context_y * context_weight
        
        if not initialized_kf:
            kf.statePre = np.array([[target_x], [target_y], [0], [0]], np.float32)
            initialized_kf = True
        
        kf.predict()
        corrected = kf.correct(np.array([[target_x], [target_y]], np.float32))
        
        current_x = float(corrected[0])
        current_y = float(corrected[1])

        # Eye-Line Bias
        y_eye_line = y + h * 0.35
        vertical_composition_score = 1.0 - abs(y_eye_line / height - 0.33)
        
        # Horizontal Leading Room
        edge_dist = current_x - 0.5
        leading_bias = edge_dist * 0.12 
        
        area_ratio = (w * h) / (width * height)
        confidence = (0.5 + area_ratio * 20.0) * vertical_composition_score
        
        raw_x.append(np.clip(current_x + leading_bias, 0.0, 1.0))
        raw_y.append(np.clip(current_y, 0.0, 1.0))
        raw_confidences.append(np.clip(confidence, 0.1, 2.0))

    # Smoothing
    x_coords = np.array(raw_x)
    y_coords = np.array(raw_y)
    c_coords = np.array(raw_confidences)
    
    window = min(len(x_coords) // 2 * 2 + 1, 15) 
    if window > 3:
        smoothed_x = savitzky_golay(x_coords, window, 2)
        smoothed_y = savitzky_golay(y_coords, window, 2)
    else:
        smoothed_x = x_coords
        smoothed_y = y_coords
        
    final_points = []
    for i in range(len(smoothed_x)):
        final_points.append({
            "index": i,
            "time": round((duration * i) / total_frames, 3),
            "offset": round(float(smoothed_x[i]), 4),
            "y_offset": round(float(smoothed_y[i]), 4),
            "confidence": round(float(c_coords[i]), 4)
        })

    return final_points

    return final_points


def main():
    try:
        args = parse_args()
        points = detect_focus_points(Path(args.frames), args.duration, args.multi_entity)
        print(json.dumps({"points": points, "count": len(points), "status": "success"}))
    except Exception as e:
        print(json.dumps({"error": str(e), "status": "failed"}))


if __name__ == "__main__":
    main()
