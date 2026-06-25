import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from tracking_service import ByteTracker

def run_benchmark(num_frames=1000, num_objects=10):
    print(f"=== ByteTrack Tracking Service Benchmark ===")
    print(f"Frames: {num_frames}, Simulated Objects: {num_objects}")
    
    tracker = ByteTracker()
    
    # Generate simulated detections moving along a linear path with noise
    detections_by_frame = []
    base_boxes = [
        [100.0 + i * 50, 100.0 + i * 50, 150.0 + i * 50, 200.0 + i * 50]
        for i in range(num_objects)
    ]
    
    for f in range(num_frames):
        frame_dets = []
        for i in range(num_objects):
            # Object moves slowly with minor noise
            dx = f * 1.5 + np.random.normal(0, 0.5)
            dy = f * 1.0 + np.random.normal(0, 0.5)
            
            box = [
                base_boxes[i][0] + dx,
                base_boxes[i][1] + dy,
                base_boxes[i][2] + dx,
                base_boxes[i][3] + dy
            ]
            
            # Occasional confidence drop/occlusion
            conf = 0.85
            if f % 20 == i:  # Occluded / low conf
                conf = 0.35
            if f % 50 == i:  # Fully lost
                continue
                
            frame_dets.append({
                "bbox": box,
                "confidence": conf
            })
        detections_by_frame.append(frame_dets)

    start_time = time.time()
    for f in range(num_frames):
        tracker.update(detections_by_frame[f])
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Tracking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Speed per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print(f"============================================")

if __name__ == "__main__":
    run_benchmark()
