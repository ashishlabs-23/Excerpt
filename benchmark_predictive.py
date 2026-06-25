import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from predictive_crop_engine import PredictiveCropEngine

def run_benchmark(num_frames=1000, num_tracks=10):
    print("=== Predictive Crop Engine Benchmark ===")
    print(f"Frames to evaluate: {num_frames}, Tracks per Frame: {num_tracks}")
    
    engine = PredictiveCropEngine(default_lookahead=10)
    
    # Pre-generate simulated tracks data per frame
    frames_data = []
    for f in range(num_frames):
        tracks = []
        for t_idx in range(num_tracks):
            # Target moving linearly
            x = 0.1 + f * 0.0005
            y = 0.2 + f * 0.0002
            tracks.append({
                "track_id": t_idx + 1,
                "bbox": [x, y, x + 0.1, y + 0.15]
            })
        frames_data.append({
            "frame": f"frame_{f}.png",
            "tracks": tracks
        })

    start_time = time.time()
    engine.process_timeline(frames_data)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("========================================")

if __name__ == "__main__":
    run_benchmark()
