import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from reframe_engine import SmartReframeEngine

def run_benchmark(num_frames=1000, num_targets=3):
    print("=== Smart Reframe Engine Benchmark ===")
    print(f"Frames: {num_frames}, Targets per Frame: {num_targets}")
    
    engine = SmartReframeEngine(width=1920, height=1080)
    
    # Pre-generate simulated priority tracking input data
    frames_data = []
    for f in range(num_frames):
        priorities = []
        for t_idx in range(num_targets):
            # Simulated targets moving
            dx = f * 0.002
            x1 = 0.2 + 0.15 * t_idx + dx
            y1 = 0.3 + 0.05 * t_idx
            
            priorities.append({
                "track_id": t_idx + 1,
                "bbox": [x1, y1, x1 + 0.1, y1 + 0.15],
                "priority_score": 0.95 - (t_idx * 0.1)
            })
        frames_data.append(priorities)

    start_time = time.time()
    for f in range(num_frames):
        engine.calculate_crop(frames_data[f])
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("======================================")

if __name__ == "__main__":
    run_benchmark()
