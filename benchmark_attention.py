import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from attention_engine import HumanAttentionEngine

def run_benchmark(num_frames=1000, num_tracks=10):
    print("=== Human Attention Prediction Engine Benchmark ===")
    print(f"Frames to process: {num_frames}, Tracks per Frame: {num_tracks}")
    
    engine = HumanAttentionEngine(grid_size=10)
    
    # Pre-generate simulated tracks data per frame
    frames_data = []
    for f in range(num_frames):
        tracks = []
        for t_idx in range(num_tracks):
            category = "person"
            if t_idx % 3 == 1:
                category = "face"
            elif t_idx % 3 == 2:
                category = "sports ball"
                
            x1 = 0.1 * t_idx + np.random.normal(0, 0.01)
            y1 = 0.15 * t_idx + np.random.normal(0, 0.01)
            
            tracks.append({
                "track_id": t_idx + 1,
                "category": category,
                "bbox": [x1, y1, x1 + 0.15, y1 + 0.25],
                "velocity": [np.random.normal(0, 0.005), np.random.normal(0, 0.005)],
                "confidence": 0.90 + np.random.normal(0, 0.02)
            })
        frames_data.append(tracks)

    start_time = time.time()
    for f in range(num_frames):
        engine.calculate_attention(frames_data[f])
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("====================================================")

if __name__ == "__main__":
    run_benchmark()
