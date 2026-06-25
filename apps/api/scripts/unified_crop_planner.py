"""
smart_crop.py — Stage 5b: Cinematic Smart Cropping Engine for Excerpt AI

Generates a crop_plan.json containing per-frame (x, y) offsets for dynamic
9:16 vertical crop positioning. Designed for CPU-only environments.

Detection cascade:
  1. MediaPipe Face Mesh (preferred — 468 landmarks, MAR speaker detection)
  2. MediaPipe Face Detection (fallback — handles profiles, fast on CPU)
  3. OpenCV Haar Cascade (fallback — frontal faces only)
  4. Edge/motion heuristic (ultimate fallback — no face detection)

Speaker identification:
  Mouth Aspect Ratio (MAR) from Face Mesh lip landmarks — measures lip
  opening/closing over time to identify the active speaker.

Content classification:
  Each frame is classified as talking_head, presentation, screen_recording,
  or mixed. The dominant type drives crop strategy and zoom factor.

Smoothing pipeline:
  Raw Detection → Kalman Filter → EMA (α=0.15) → Dead Zone (2%) → Output

Usage:
  python smart_crop.py --frames <dir> --duration <float> [--output <path>]
  python smart_crop.py --test   (self-test with synthetic data)
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from collections import Counter

import cv2
import numpy as np

# ─── Detection Backend Selection ────────────────────────────────────────────

_MEDIAPIPE_AVAILABLE = False
_FACE_MESH_AVAILABLE = False
_mp_face_detection = None
_mp_face_mesh = None

try:
    import mediapipe as mp
    _mp_face_detection = mp.solutions.face_detection
    _MEDIAPIPE_AVAILABLE = True
    try:
        _mp_face_mesh = mp.solutions.face_mesh
        _FACE_MESH_AVAILABLE = True
    except Exception:
        pass
except ImportError:
    pass

_YOLO_AVAILABLE = False
try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    pass

# ─── Configuration Constants ───────────────────────────────────────────────

EMA_ALPHA = 0.15
DEAD_ZONE_THRESHOLD = 0.02
SCENE_CUT_THRESHOLD = 0.35
EYE_LINE_RATIO = 0.33
LEAD_ROOM_FACTOR = 0.08
KALMAN_PROCESS_NOISE = 0.008
KALMAN_MEASUREMENT_NOISE = 0.05

# Face Mesh lip landmark indices for MAR calculation
UPPER_LIP_IDX = 13
LOWER_LIP_IDX = 14
LEFT_LIP_IDX = 78
RIGHT_LIP_IDX = 308


# ─── Mouth Aspect Ratio ────────────────────────────────────────────────────

def compute_mar(landmarks, h: int, w: int) -> float:
    """Compute Mouth Aspect Ratio from Face Mesh landmarks."""
    try:
        upper = landmarks[UPPER_LIP_IDX]
        lower = landmarks[LOWER_LIP_IDX]
        left = landmarks[LEFT_LIP_IDX]
        right = landmarks[RIGHT_LIP_IDX]

        vertical = abs((lower.y - upper.y) * h)
        horizontal = abs((right.x - left.x) * w)

        if horizontal < 1:
            return 0.0
        return vertical / horizontal
    except Exception:
        return 0.0


# ─── Content Classification ────────────────────────────────────────────────

def detect_quadrilaterals(image: np.ndarray) -> List[Dict]:
    """Detect large rectangular objects (whiteboards, screens, slides)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    h, w = image.shape[:2]
    min_area = (w * h) * 0.05
    quads = []

    for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        area = cv2.contourArea(cnt)
        if area < min_area:
            break
        peri = cv2.arcLength(cnt, True)
        approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
        if len(approx) == 4:
            x, y, bw, bh = cv2.boundingRect(approx)
            quads.append({
                "cx": float((x + bw / 2) / w),
                "cy": float((y + bh / 2) / h),
                "area": float(area / (w * h)),
            })

    return quads


def detect_text_density(gray: np.ndarray) -> float:
    """Heuristic: high edge density in horizontal bands suggests text/code."""
    edges = cv2.Canny(gray, 100, 200)
    h, w = edges.shape
    # Sample middle 60% of frame
    roi = edges[int(h * 0.2):int(h * 0.8), int(w * 0.1):int(w * 0.9)]
    if roi.size == 0:
        return 0.0
    return float(np.mean(roi) / 255.0)


def classify_frame(faces: List[Dict], quads: List[Dict], text_density: float) -> str:
    """Classify frame content type."""
    face_area = sum(f.get('area', 0) for f in faces)
    quad_area = sum(q.get('area', 0) for q in quads)

    if face_area > 0.08 and quad_area < 0.03 and text_density < 0.15:
        return 'talking_head'
    elif quad_area > 0.15 and face_area < 0.02:
        return 'screen_recording'
    elif text_density > 0.25 and face_area < 0.02:
        return 'screen_recording'
    elif face_area > 0.03 and (quad_area > 0.05 or text_density > 0.12):
        return 'presentation'
    else:
        return 'mixed'


# ─── Kalman Filter ──────────────────────────────────────────────────────────

class SmoothTracker:
    """Combined Kalman + EMA tracker with dead-zone and scene-cut logic."""

    def __init__(self):
        self.kf = cv2.KalmanFilter(4, 2)
        self.kf.measurementMatrix = np.array(
            [[1, 0, 0, 0], [0, 1, 0, 0]], np.float32
        )
        self.kf.transitionMatrix = np.array(
            [[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32
        )
        self.kf.processNoiseCov = np.eye(4, dtype=np.float32) * KALMAN_PROCESS_NOISE
        self.kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * KALMAN_MEASUREMENT_NOISE

        self.initialized = False
        self.ema_x: float = 0.5
        self.ema_y: float = 0.5
        self.last_output_x: float = 0.5
        self.last_output_y: float = 0.5
        self.consecutive_no_detect: int = 0

    def update(self, detected: bool, raw_x: float, raw_y: float) -> Tuple[float, float]:
        if not detected:
            self.consecutive_no_detect += 1
            if self.initialized and self.consecutive_no_detect <= 8:
                pred = self.kf.predict()
                kx = float(np.clip(pred[0, 0], 0, 1))
                ky = float(np.clip(pred[1, 0], 0, 1))
                return self._apply_ema_and_deadzone(kx, ky)
            return self.last_output_x, self.last_output_y

        self.consecutive_no_detect = 0

        if self.initialized:
            dx = abs(raw_x - self.last_output_x)
            dy = abs(raw_y - self.last_output_y)
            if dx > SCENE_CUT_THRESHOLD or dy > SCENE_CUT_THRESHOLD:
                self._reset_kalman(raw_x, raw_y)
                self.ema_x = raw_x
                self.ema_y = raw_y
                self.last_output_x = raw_x
                self.last_output_y = raw_y
                return raw_x, raw_y

        if not self.initialized:
            self._reset_kalman(raw_x, raw_y)
            self.ema_x = raw_x
            self.ema_y = raw_y
            self.last_output_x = raw_x
            self.last_output_y = raw_y
            self.initialized = True
            return raw_x, raw_y

        self.kf.predict()
        measurement = np.array([[raw_x], [raw_y]], np.float32)
        corrected = self.kf.correct(measurement)
        kx = float(np.clip(corrected[0, 0], 0, 1))
        ky = float(np.clip(corrected[1, 0], 0, 1))

        return self._apply_ema_and_deadzone(kx, ky)

    def _apply_ema_and_deadzone(self, kx: float, ky: float) -> Tuple[float, float]:
        self.ema_x = EMA_ALPHA * kx + (1 - EMA_ALPHA) * self.ema_x
        self.ema_y = EMA_ALPHA * ky + (1 - EMA_ALPHA) * self.ema_y

        out_x = self.ema_x
        out_y = self.ema_y
        if abs(out_x - self.last_output_x) < DEAD_ZONE_THRESHOLD:
            out_x = self.last_output_x
        if abs(out_y - self.last_output_y) < DEAD_ZONE_THRESHOLD:
            out_y = self.last_output_y

        self.last_output_x = out_x
        self.last_output_y = out_y
        return out_x, out_y

    def _reset_kalman(self, x: float, y: float):
        self.kf.statePre = np.array([[x], [y], [0], [0]], np.float32)
        self.kf.statePost = np.array([[x], [y], [0], [0]], np.float32)
        self.kf.errorCovPre = np.eye(4, dtype=np.float32) * 0.1
        self.kf.errorCovPost = np.eye(4, dtype=np.float32) * 0.1


# ─── Unified Track Manager & Scene Planner ───────────────────────────────────

class UnifiedTrackManager:
    """Persistent Face/Object Tracking with Confidence Decay."""
    def __init__(self):
        self.tracks = {}
        self.next_id = 1
        self.max_lost_frames = 15

    def update(self, detections: List[Dict], mars: List[float]) -> List[Dict]:
        current_tracks = []
        unmatched_detections = detections.copy()
        unmatched_mars = mars.copy() if mars else [0.0]*len(detections)

        # Update existing tracks
        for track_id, track in list(self.tracks.items()):
            best_match_idx = -1
            min_dist = 0.15 # Max distance to match

            for i, det in enumerate(unmatched_detections):
                dist = np.sqrt((det['cx'] - track['cx'])**2 + (det['cy'] - track['cy'])**2)
                if dist < min_dist:
                    min_dist = dist
                    best_match_idx = i

            if best_match_idx != -1:
                # Match found
                det = unmatched_detections.pop(best_match_idx)
                mar = unmatched_mars.pop(best_match_idx)
                
                track['cx'] = track['cx'] * 0.4 + det['cx'] * 0.6
                track['cy'] = track['cy'] * 0.4 + det['cy'] * 0.6
                track['area'] = det['area']
                track['mar_activity'] = track['mar_activity'] * 0.6 + mar * 0.4
                track['lost_frames'] = 0
                track['tracking_confidence'] = min(1.0, track['tracking_confidence'] + 0.1)
                
                current_tracks.append(track)
            else:
                # Track lost
                track['lost_frames'] += 1
                track['tracking_confidence'] *= 0.8 # Decay
                if track['lost_frames'] <= self.max_lost_frames:
                    current_tracks.append(track)
                else:
                    del self.tracks[track_id]

        # Register new tracks
        for i, det in enumerate(unmatched_detections):
            mar = unmatched_mars[i]
            new_track = {
                'track_id': self.next_id,
                'cx': det['cx'],
                'cy': det['cy'],
                'area': det['area'],
                'mar_activity': mar,
                'lost_frames': 0,
                'tracking_confidence': 0.8
            }
            self.tracks[self.next_id] = new_track
            current_tracks.append(new_track)
            self.next_id += 1

        return current_tracks

class ScenePlanner:
    """Decides layout and generates regions based on tracks and content type."""
    def plan(self, tracks: List[Dict], frame_type: str, time_sec: float) -> Dict:
        active_tracks = [t for t in tracks if t['tracking_confidence'] > 0.3]
        active_tracks.sort(key=lambda t: t['cx']) # Sort Left to Right

        if frame_type == 'podcast' or len(active_tracks) >= 2:
            if len(active_tracks) >= 2:
                # Top / Bottom split
                t1, t2 = active_tracks[0], active_tracks[-1]
                return {
                    "layout": "split",
                    "regions": [
                        {"track": t1['track_id'], "slot": "top", "x": round(t1['cx'], 4), "y": round(t1['cy'], 4), "confidence": round(t1['tracking_confidence'], 4)},
                        {"track": t2['track_id'], "slot": "bottom", "x": round(t2['cx'], 4), "y": round(t2['cy'], 4), "confidence": round(t2['tracking_confidence'], 4)}
                    ]
                }
        
        # Single speaker layout
        best_track = max(active_tracks, key=lambda t: t['area'] + t['mar_activity']) if active_tracks else None
        if best_track:
            return {
                "layout": "single",
                "regions": [
                    {"track": best_track['track_id'], "slot": "single", "x": round(best_track['cx'], 4), "y": round(best_track['cy'], 4), "confidence": round(best_track['tracking_confidence'], 4)}
                ]
            }
        
        return {"layout": "single", "regions": []}


# ─── Face Detection Backends ───────────────────────────────────────────────

def detect_faces_mesh(image: np.ndarray, mesh_detector) -> Tuple[List[Dict], List[float]]:
    """Detect faces + compute MAR using Face Mesh."""
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = mesh_detector.process(rgb)

    if not results.multi_face_landmarks:
        return [], []

    h, w = image.shape[:2]
    faces = []
    mars = []

    for face_lm in results.multi_face_landmarks:
        lm = face_lm.landmark
        xs = [l.x for l in lm]
        ys = [l.y for l in lm]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        cx = (x_min + x_max) / 2
        cy = (y_min + y_max) / 2
        area = (x_max - x_min) * (y_max - y_min)

        faces.append({
            "cx": float(np.clip(cx, 0, 1)),
            "cy": float(np.clip(cy, 0, 1)),
            "area": float(area),
            "confidence": 0.9,
        })
        mars.append(compute_mar(lm, h, w))

    return faces, mars


def detect_faces_mediapipe(image: np.ndarray, detector) -> Tuple[List[Dict], List[float]]:
    """Detect faces using MediaPipe Face Detection (no MAR)."""
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = detector.process(rgb)

    if not results.detections:
        return [], []

    faces = []
    for d in results.detections:
        bb = d.location_data.relative_bounding_box
        cx = bb.xmin + bb.width / 2
        cy = bb.ymin + bb.height / 2
        faces.append({
            "cx": float(np.clip(cx, 0, 1)),
            "cy": float(np.clip(cy, 0, 1)),
            "area": float(bb.width * bb.height),
            "confidence": float(d.score[0]),
        })

    return faces, [0.0] * len(faces)


def detect_faces_haar(image: np.ndarray, classifier) -> Tuple[List[Dict], List[float]]:
    """Detect faces using Haar cascade (no MAR)."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    rects = classifier.detectMultiScale(gray, 1.1, 5, minSize=(40, 40))

    if len(rects) == 0:
        return [], []

    h, w = image.shape[:2]
    faces = []
    for (x, y, fw, fh) in rects:
        faces.append({
            "cx": float((x + fw / 2) / w),
            "cy": float((y + fh / 2) / h),
            "area": float((fw * fh) / (w * h)),
            "confidence": 0.6,
        })

    return faces, [0.0] * len(faces)


# ─── Adaptive Crop Blending ────────────────────────────────────────────────

CONTENT_WEIGHTS = {
    'talking_head':    {'face': 1.0,  'content': 0.0},
    'presentation':    {'face': 0.60, 'content': 0.40},
    'screen_recording': {'face': 0.10, 'content': 0.90},
    'mixed':           {'face': 0.70, 'content': 0.30},
}

CONTENT_ZOOM = {
    'talking_head': 1.20,
    'presentation': 1.05,
    'screen_recording': 1.0,
    'mixed': 1.10,
}


def blend_target(face: Optional[Dict], quads: List[Dict], content_type: str) -> Tuple[float, float]:
    """Blend face and content targets based on content type."""
    w = CONTENT_WEIGHTS.get(content_type, CONTENT_WEIGHTS['mixed'])

    face_x = face['cx'] if face else 0.5
    face_y = face['cy'] if face else 0.5

    if quads:
        best_q = max(quads, key=lambda q: q['area'])
        content_x, content_y = best_q['cx'], best_q['cy']
    else:
        content_x, content_y = 0.5, 0.5

    target_x = face_x * w['face'] + content_x * w['content']
    target_y = face_y * w['face'] + content_y * w['content']

    return float(np.clip(target_x, 0, 1)), float(np.clip(target_y, 0, 1))


def detect_action_centroid(image: np.ndarray, prev_gray: Optional[np.ndarray]) -> Optional[Tuple[float, float]]:
    """Detects the centroid of motion and high-contrast features for sports/action tracking."""
    if prev_gray is None:
        return None
    try:
        h, w = image.shape[:2]
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # 1. Motion detection via frame difference
        diff = cv2.absdiff(gray, prev_gray)
        _, thresh = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
        
        # 2. Sports-Specific Grass/Field Masking (HSV green filter)
        hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        # Green Hue is roughly 30-90. Saturation/Value above 40 to ignore dark/white overlays.
        lower_green = np.array([30, 40, 40])
        upper_green = np.array([90, 255, 255])
        field_mask = cv2.inRange(hsv, lower_green, upper_green)
        
        # Dilate grass mask to include players standing on the grass
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
        field_mask_dilated = cv2.dilate(field_mask, kernel, iterations=1)
        
        # Intersect motion with field mask
        field_motion = cv2.bitwise_and(thresh, field_mask_dilated)
        
        # 3. Find contours of moving blobs (players) on the field
        contours, _ = cv2.findContours(field_motion, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        active_points = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            # Ignore tiny noise or huge camera pans (greater than 25% of the frame)
            if 50 < area < (w * h * 0.25):
                M = cv2.moments(cnt)
                if M["m00"] > 0:
                    cx = M["m10"] / M["m00"]
                    cy = M["m01"] / M["m00"]
                    active_points.append((cx, cy, area))
        
        if active_points:
            # Sort by area (largest blobs are active players/ball groups)
            active_points.sort(key=lambda x: x[2], reverse=True)
            
            player_blob = active_points[0]
            top_blobs = active_points[:3]
            
            # Football Focus: We want the crop to span both the player and the ball.
            # Instead of a pure area-weighted average (which ignores the small ball),
            # we find the geometric center of the top motion blobs.
            cx_min = min(b[0] for b in top_blobs)
            cx_max = max(b[0] for b in top_blobs)
            cy_min = min(b[1] for b in top_blobs)
            cy_max = max(b[1] for b in top_blobs)
            
            geom_x = (cx_min + cx_max) / 2.0
            geom_y = (cy_min + cy_max) / 2.0
            
            # Bias slightly toward the primary player (70% geometric center, 30% player)
            weighted_x = geom_x * 0.7 + player_blob[0] * 0.3
            weighted_y = geom_y * 0.7 + player_blob[1] * 0.3
            
            return float(np.clip(weighted_x / w, 0, 1)), float(np.clip(weighted_y / h, 0, 1))
            
        # 4. Fallback if motion is low: High contrast saliency points on the green field
        # Invert the green field mask to find non-grass objects (players, lines, ball)
        non_grass = cv2.bitwise_not(field_mask)
        # Apply a bounding box mask to ignore scoreboards (top 15% and bottom 10%)
        roi_mask = np.zeros_like(non_grass)
        cv2.rectangle(roi_mask, (int(w*0.05), int(h*0.15)), (int(w*0.95), int(h*0.9)), 255, -1)
        salient_objects = cv2.bitwise_and(non_grass, roi_mask)
        
        # Find player silhouettes on the field
        contours, _ = cv2.findContours(salient_objects, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        player_points = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            # Typical player size on wide shots
            if 30 < area < (w * h * 0.05):
                M = cv2.moments(cnt)
                if M["m00"] > 0:
                    cx = M["m10"] / M["m00"]
                    cy = M["m01"] / M["m00"]
                    player_points.append((cx, cy, area))
                    
        if player_points:
            # Group center of player clusters
            cx = float(np.mean([p[0] for p in player_points]) / w)
            cy = float(np.mean([p[1] for p in player_points]) / h)
            return float(np.clip(cx, 0, 1)), float(np.clip(cy, 0, 1))
            
        return None
    except Exception:
        return None


# ─── Main Pipeline ──────────────────────────────────────────────────────────

def generate_crop_plan(frame_dir: Path, duration: float, output_path: Optional[Path] = None) -> Dict:
    frame_paths = sorted([
        p for p in frame_dir.iterdir()
        if p.suffix.lower() in {".pgm", ".png", ".jpg", ".jpeg"}
    ])

    if not frame_paths:
        return {"points": [], "status": "no_frames", "detection_backend": "none", "content_type": "mixed"}

    # ── Select detection backend ──
    mesh_detector = None
    mp_detector = None
    haar_classifier = None
    backend_name = "heuristic"

    if _FACE_MESH_AVAILABLE:
        mesh_detector = _mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=3,
            refine_landmarks=True,
            min_detection_confidence=0.5
        )
        backend_name = "face_mesh"
    elif _MEDIAPIPE_AVAILABLE:
        mp_detector = _mp_face_detection.FaceDetection(
            model_selection=0, min_detection_confidence=0.5
        )
        backend_name = "mediapipe"
    else:
        cascade_candidates = [
            os.environ.get("OPENCV_FACE_CASCADE"),
            "/usr/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
            "/usr/local/share/opencv4/haarcascades/haarcascade_frontalface_default.xml",
            "/opt/opencv-data/haarcascade_frontalface_default.xml",
            "/app/scripts/haarcascade_frontalface_default.xml",
        ]
        for candidate in cascade_candidates:
            if candidate and Path(candidate).exists():
                haar_classifier = cv2.CascadeClassifier(candidate)
                backend_name = "haar"
                break

    # ── Load YOLO model if available ──
    yolo_model = None
    if _YOLO_AVAILABLE:
        try:
            yolo_model = YOLO("yolo11n.pt")
        except Exception:
            pass

    # ── Process frames ──
    tracker_smooth = SmoothTracker()
    track_manager = UnifiedTrackManager()
    scene_planner = ScenePlanner()
    frames_data: List[Dict] = []
    content_types: List[str] = []
    total_frames = max(1, len(frame_paths) - 1)
    detect_count = 0
    total_confidence = 0.0
    prev_gray = None

    for idx, fpath in enumerate(frame_paths):
        # Support Windows Unicode paths safely via np.fromfile
        try:
            image = cv2.imdecode(np.fromfile(str(fpath), dtype=np.uint8), cv2.IMREAD_COLOR)
        except Exception:
            image = None
        if image is None:
            x, y = tracker_smooth.update(False, 0, 0)
            points.append({
                "index": idx,
                "time": round((duration * idx) / total_frames, 3),
                "x": round(x, 4), "y": round(y, 4),
                "confidence": 0.0,
            })
            content_types.append('mixed')
            continue

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # ── Detection ──
        faces: List[Dict] = []
        mars: List[float] = []

        if mesh_detector is not None:
            faces, mars = detect_faces_mesh(image, mesh_detector)
        elif mp_detector is not None:
            faces, mars = detect_faces_mediapipe(image, mp_detector)
        elif haar_classifier is not None:
            faces, mars = detect_faces_haar(image, haar_classifier)

        # Multi-person / YOLOv11 person tracking detection
        person_boxes = []
        if yolo_model is not None:
            try:
                yolo_results = yolo_model.predict(image, classes=[0], verbose=False)
                for r in yolo_results:
                    for box in r.boxes:
                        x1, y1, x2, y2 = box.xyxy[0].tolist()
                        h_img, w_img = image.shape[:2]
                        person_boxes.append([x1 / w_img, y1 / h_img, x2 / w_img, y2 / h_img])
            except Exception:
                pass

        # ── Content classification ──
        quads = detect_quadrilaterals(image)
        text_density = detect_text_density(gray)
        frame_type = classify_frame(faces, quads, text_density)
        content_types.append(frame_type)

        # ── Unified Tracking & Planning ──
        current_tracks = track_manager.update(faces, mars)
        time_sec = round((duration * idx) / total_frames, 3)
        
        # Determine base layout using Scene Planner
        plan = scene_planner.plan(current_tracks, frame_type, time_sec)
        
        # Generic single fallback (Sports / No Faces)
        if plan["layout"] == "single" and not plan["regions"]:
            # Fallback logic to SmoothTracker
            if len(person_boxes) >= 2:
                detect_count += 1
                conf = 0.95
                total_confidence += conf
                x_min = min(b[0] for b in person_boxes)
                x_max = max(b[2] for b in person_boxes)
                y_min = min(b[1] for b in person_boxes)
                y_max = max(b[3] for b in person_boxes)
                raw_x = (x_min + x_max) / 2.0
                raw_y = (y_min + y_max) / 2.0
                x, y = tracker_smooth.update(True, raw_x, raw_y)
            else:
                action_pt = detect_action_centroid(image, prev_gray)
                if action_pt is not None:
                    detect_count += 1
                    raw_x, raw_y = action_pt
                    x, y = tracker_smooth.update(True, raw_x, raw_y)
                    conf = 0.4
                elif quads:
                    best_q = max(quads, key=lambda q: q['area'])
                    x, y = tracker_smooth.update(True, best_q['cx'], best_q['cy'])
                    conf = 0.3
                else:
                    x, y = tracker_smooth.update(False, 0, 0)
                    conf = 0.0
            
            plan["regions"].append({
                "slot": "single",
                "x": round(x, 4),
                "y": round(y, 4),
                "confidence": round(conf, 4)
            })
        else:
            detect_count += 1
            total_confidence += max([r.get("confidence", 0) for r in plan["regions"]] + [0])
            # Update generic tracker to follow the primary region just in case
            if plan["regions"]:
                tracker_smooth.update(True, plan["regions"][0]["x"], plan["regions"][0]["y"])

        prev_gray = gray

        frames_data.append({
            "index": idx,
            "time": time_sec,
            "layout": plan["layout"],
            "regions": plan["regions"]
        })

    # ── Cleanup ──
    if mesh_detector is not None and hasattr(mesh_detector, 'close'):
        mesh_detector.close()
    if mp_detector is not None and hasattr(mp_detector, 'close'):
        mp_detector.close()

    # ── Determine dominant content type ──
    type_counts = Counter(content_types)
    dominant_type = type_counts.most_common(1)[0][0] if type_counts else 'mixed'

    result = {
        "frames_data": frames_data,
        "detection_backend": backend_name,
        "content_type": dominant_type,
        "content_type_breakdown": dict(type_counts),
        "recommended_zoom": CONTENT_ZOOM.get(dominant_type, 1.10),
        "stats": {
            "total_frames": len(frame_paths),
            "faces_detected": detect_count,
            "detection_rate": round(detect_count / max(1, len(frame_paths)), 3),
            "mean_confidence": round(total_confidence / max(1, detect_count), 4) if detect_count > 0 else 0,
            "ema_alpha": EMA_ALPHA,
            "dead_zone": DEAD_ZONE_THRESHOLD,
            "mar_speaker_detection": backend_name == "face_mesh",
        },
        "status": "success",
    }

    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

    return result


# ─── Self-Test ──────────────────────────────────────────────────────────────

def run_self_test():
    print("=== Smart Crop Self-Test ===")
    print(f"Face Mesh available: {_FACE_MESH_AVAILABLE}")
    print(f"MediaPipe available: {_MEDIAPIPE_AVAILABLE}")

    tracker = SmoothTracker()
    test_points = []
    for i in range(30):
        raw_x = 0.2 + (0.6 * i / 29)
        raw_y = 0.4
        x, y = tracker.update(True, raw_x, raw_y)
        test_points.append({"frame": i, "raw_x": round(raw_x, 4), "out_x": round(x, 4)})

    first_out = test_points[0]["out_x"]
    last_out = test_points[-1]["out_x"]
    mid_raw = test_points[15]["raw_x"]
    mid_out = test_points[15]["out_x"]

    assert first_out >= 0.19, f"First output should be near 0.2, got {first_out}"
    assert last_out < 0.8, f"Last output should lag raw 0.8, got {last_out}"
    assert mid_out < mid_raw, f"Mid output ({mid_out}) should lag behind raw ({mid_raw})"

    # Content classification test
    assert classify_frame(
        [{'area': 0.12}], [], 0.05
    ) == 'talking_head'
    assert classify_frame(
        [], [{'area': 0.20}], 0.30
    ) == 'screen_recording'
    assert classify_frame(
        [{'area': 0.05}], [{'area': 0.10}], 0.15
    ) == 'presentation'

    print("✓ EMA smoothing verified")
    print("✓ Content classification verified")
    print("=== All tests passed ===")

    return {"status": "pass", "backend": "face_mesh" if _FACE_MESH_AVAILABLE else "mediapipe" if _MEDIAPIPE_AVAILABLE else "haar/heuristic"}


# ─── CLI ────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(description="Stage 5b: Cinematic Smart Crop Engine")
    parser.add_argument("--frames", help="Directory containing extracted frame images.")
    parser.add_argument("--duration", type=float, help="Clip duration in seconds.")
    parser.add_argument("--output", help="Optional output path for crop_plan.json.")
    parser.add_argument("--test", action="store_true", help="Run self-test with synthetic data.")
    parser.add_argument("--multi-entity", action="store_true", default=True)
    return parser.parse_args()


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    args = parse_args()

    if args.test:
        result = run_self_test()
        print(json.dumps(result))
        return

    if not args.frames or not args.duration:
        print(json.dumps({"error": "Missing --frames or --duration", "status": "failed"}))
        sys.exit(1)

    frame_dir = Path(args.frames)
    if not frame_dir.exists():
        print(json.dumps({"error": f"Frame directory not found: {args.frames}", "status": "failed"}))
        sys.exit(1)

    output_path = Path(args.output) if args.output else None

    try:
        result = generate_crop_plan(frame_dir, args.duration, output_path)

        # Legacy fallback compatibility layer (to avoid breaking orchestrator completely)
        legacy_points = []
        for f in result.get("frames_data", []):
            if f["regions"]:
                reg = f["regions"][0]
                legacy_points.append({
                    "index": f["index"],
                    "time": f["time"],
                    "offset": reg["x"],
                    "y_offset": reg.get("y", 0.5),
                    "confidence": reg.get("confidence", 0.0),
                })

        output = {
            "points": legacy_points,  # legacy
            "frames_data": result.get("frames_data", []),  # New schema
            "count": len(legacy_points),
            "status": result["status"],
            "detection_backend": result["detection_backend"],
            "content_type": result.get("content_type", "mixed"),
            "content_type_breakdown": result.get("content_type_breakdown", {}),
            "recommended_zoom": result.get("recommended_zoom", 1.10),
            "stats": result["stats"],
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e), "status": "failed"}))
        sys.exit(1)


if __name__ == "__main__":
    main()
