import os
import sys
import json
import time
import argparse
from pathlib import Path
import cv2
import numpy as np

# Try importing YOLO and MediaPipe/PyTorch
_YOLO_AVAILABLE = False
_TORCH_AVAILABLE = False

try:
    import torch
    _TORCH_AVAILABLE = True
except ImportError:
    pass

try:
    from ultralytics import YOLO
    _YOLO_AVAILABLE = True
except ImportError:
    pass

# Global model cache to avoid reloading models on batch iterations
MODEL_CACHE = {}

class VideoDetectionEngine:
    def __init__(self, confidence_threshold=0.25, use_gpu=True):
        self.conf_threshold = confidence_threshold
        self.device = "cuda" if (use_gpu and _TORCH_AVAILABLE and torch.cuda.is_available()) else "cpu"
        print(f"[YOLO Engine]: Initializing detection engine on device: {self.device}", file=sys.stderr)
        
        # Load YOLO Model
        self.yolo_model = self._load_yolo_model()
        
        # Initialize Face Cascade for combined face detection (CPU/GPU fallback)
        self.face_cascade = self._load_face_cascade()

    def _load_yolo_model(self):
        if not _YOLO_AVAILABLE:
            print("[YOLO Engine]: Warning - ultralytics package not installed. Operating in fallback mode.", file=sys.stderr)
            return None
        
        model_name = "yolo11n.pt"  # Lightweight nano model
        if model_name not in MODEL_CACHE:
            try:
                # Cache model loaded to active device
                MODEL_CACHE[model_name] = YOLO(model_name).to(self.device)
                print(f"[YOLO Engine]: Model {model_name} successfully loaded and cached.", file=sys.stderr)
            except Exception as e:
                print(f"[YOLO Engine]: Error loading model {model_name}: {e}", file=sys.stderr)
                return None
        return MODEL_CACHE[model_name]

    def _load_face_cascade(self):
        cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        if os.path.exists(cascade_path):
            return cv2.CascadeClassifier(cascade_path)
        return None

    def detect_frame(self, frame):
        """
        Runs inference on a single frame.
        Detects: person, face, sports ball, laptop, screen, whiteboard, phone.
        """
        h_img, w_img = frame.shape[:2]
        detections = []

        # 1. General Object Detection (YOLOv11)
        # COCO Class mapping: 0: person, 32: sports ball, 62: tv (screen), 63: laptop, 67: cell phone
        if self.yolo_model is not None:
            try:
                results = self.yolo_model.predict(frame, conf=self.conf_threshold, verbose=False, device=self.device)
                for r in results:
                    for box in r.boxes:
                        cls_id = int(box.cls[0])
                        conf = float(box.conf[0])
                        x1, y1, x2, y2 = box.xyxy[0].tolist()

                        class_name = None
                        if cls_id == 0: class_name = "person"
                        elif cls_id == 32: class_name = "sports ball"
                        elif cls_id == 62: class_name = "screen"
                        elif cls_id == 63: class_name = "laptop"
                        elif cls_id == 67: class_name = "phone"

                        # Whiteboard heuristic (large rectangular screens or tables)
                        if cls_id == 62 and ((x2 - x1) * (y2 - y1)) / (w_img * h_img) > 0.15:
                            class_name = "whiteboard"

                        if class_name:
                            detections.append({
                                "class": class_name,
                                "bbox": [round(x1/w_img, 4), round(y1/h_img, 4), round(x2/w_img, 4), round(y2/h_img, 4)],
                                "confidence": round(conf, 4)
                            })
            except Exception as e:
                print(f"[YOLO Engine]: General inference error: {e}", file=sys.stderr)

        # 2. Face Detection Fallback/Complement
        # Runs Haar Cascade to complement YOLO's person detection with facial positions
        if self.face_cascade is not None:
            try:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
                for (x, y, w, h) in faces:
                    detections.append({
                        "class": "face",
                        "bbox": [round(x/w_img, 4), round(y/h_img, 4), round((x+w)/w_img, 4), round((y+h)/h_img, 4)],
                        "confidence": 0.85
                    })
            except Exception:
                pass

        return detections

    def process_batch(self, frame_paths, batch_size=8):
        """
        Executes batch inference on a list of frame image paths.
        """
        results_list = []
        for i in range(0, len(frame_paths), batch_size):
            batch_paths = frame_paths[i:i+batch_size]
            batch_images = []
            valid_paths = []

            for path in batch_paths:
                try:
                    img = cv2.imread(str(path))
                    if img is not None:
                        batch_images.append(img)
                        valid_paths.append(path)
                except Exception:
                    pass

            if not batch_images:
                continue

            # In a real batch pipeline, YOLO can take a list of images
            if self.yolo_model is not None and len(batch_images) > 1:
                try:
                    # Execute batch predict
                    batch_results = self.yolo_model.predict(batch_images, conf=self.conf_threshold, verbose=False, device=self.device)
                    for idx, r in enumerate(batch_results):
                        fpath = valid_paths[idx]
                        img = batch_images[idx]
                        h_img, w_img = img.shape[:2]
                        detections = []

                        for box in r.boxes:
                            cls_id = int(box.cls[0])
                            conf = float(box.conf[0])
                            x1, y1, x2, y2 = box.xyxy[0].tolist()

                            class_name = None
                            if cls_id == 0: class_name = "person"
                            elif cls_id == 32: class_name = "sports ball"
                            elif cls_id == 62: class_name = "screen"
                            elif cls_id == 63: class_name = "laptop"
                            elif cls_id == 67: class_name = "phone"

                            if cls_id == 62 and ((x2 - x1) * (y2 - y1)) / (w_img * h_img) > 0.15:
                                class_name = "whiteboard"

                            if class_name:
                                detections.append({
                                    "class": class_name,
                                    "bbox": [round(x1/w_img, 4), round(y1/h_img, 4), round(x2/w_img, 4), round(y2/h_img, 4)],
                                    "confidence": round(conf, 4)
                                })
                        
                        # Add faces
                        if self.face_cascade is not None:
                            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                            faces = self.face_cascade.detectMultiScale(gray, 1.1, 5, minSize=(30, 30))
                            for (fx, fy, fw, fh) in faces:
                                detections.append({
                                    "class": "face",
                                    "bbox": [round(fx/w_img, 4), round(fy/h_img, 4), round((fx+fw)/w_img, 4), round((fy+fh)/h_img, 4)],
                                    "confidence": 0.85
                                })

                        results_list.append({
                            "frame": fpath.name,
                            "detections": detections
                        })
                except Exception:
                    # Fallback to single frame processing
                    for idx, img in enumerate(batch_images):
                        results_list.append({
                            "frame": valid_paths[idx].name,
                            "detections": self.detect_frame(img)
                        })
            else:
                for idx, img in enumerate(batch_images):
                    results_list.append({
                        "frame": valid_paths[idx].name,
                        "detections": self.detect_frame(img)
                    })

        return results_list

def main():
    parser = argparse.ArgumentParser(description="YOLOv11 Detection Service for Excerpt 2.0")
    parser.add_argument("--frames", required=True, help="Directory containing frames to analyze")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--batch-size", type=int, default=8, help="Batch size for inference")
    parser.add_argument("--cpu", action="store_true", help="Force CPU execution")
    args = parser.parse_args()

    frame_dir = Path(args.frames)
    if not frame_dir.exists():
        print(json.dumps({"status": "failed", "error": "Frames directory not found"}))
        sys.exit(1)

    frame_paths = sorted([
        p for p in frame_dir.iterdir()
        if p.suffix.lower() in {".pgm", ".png", ".jpg", ".jpeg"}
    ])

    engine = VideoDetectionEngine(confidence_threshold=args.conf, use_gpu=not args.cpu)
    
    start_time = time.time()
    results = engine.process_batch(frame_paths, batch_size=args.batch_size)
    duration = time.time() - start_time

    output = {
        "status": "success",
        "processing_time_sec": round(duration, 3),
        "fps": round(len(frame_paths) / max(0.001, duration), 2),
        "results": results
    }
    print(json.dumps(output))

if __name__ == "__main__":
    main()
