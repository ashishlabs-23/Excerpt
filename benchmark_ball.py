import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from ball_intelligence_engine import BallTrajectoryEngine

def run_benchmark(num_frames=1000, num_players=10):
    print("=== Ball Trajectory Intelligence Engine Benchmark ===")
    print(f"Frames: {num_frames}, Players per Frame: {num_players}")
    
    engine = BallTrajectoryEngine(sport="football")
    
    # Pre-generate simulated tracks data per frame
    frames_data = []
    for f in range(num_frames):
        tracks = []
        # Add ball
        bx = 0.1 + f * 0.0005
        by = 0.5
        tracks.append({
            "track_id": 1,
            "category": "sports ball",
            "bbox": [bx, by, bx + 0.02, by + 0.02]
        })
        # Add players
        for p_idx in range(num_players):
            px = 0.2 + 0.05 * p_idx + np.random.normal(0, 0.01)
            py = 0.4 + 0.02 * p_idx + np.random.normal(0, 0.01)
            tracks.append({
                "track_id": p_idx + 2,
                "category": "person",
                "bbox": [px, py, px + 0.06, py + 0.15]
            })
        frames_data.append({
            "frame": f"frame_{f:04d}.jpg",
            "tracks": tracks
        })

    start_time = time.time()
    results = engine.process_timeline(frames_data)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("============================================")

if __name__ == "__main__":
    run_benchmark()
