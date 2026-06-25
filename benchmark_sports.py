import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from sports_engine import SportsIntelligenceEngine

def run_benchmark(num_frames=1000, num_players=10):
    print("=== Sports Intelligence Engine Benchmark ===")
    print(f"Frames: {num_frames}, Players per Frame: {num_players}")
    
    engine = SportsIntelligenceEngine(width=1920, height=1080)
    
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
            "bbox": [bx, by, bx + 0.02, by + 0.02],
            "velocity": [0.0005, 0.0]
        })
        # Add scoreboard screen
        tracks.append({
            "track_id": 2,
            "category": "screen",
            "bbox": [0.05, 0.05, 0.15, 0.12]
        })
        # Add players
        for p_idx in range(num_players):
            px = 0.2 + 0.05 * p_idx + np.random.normal(0, 0.01)
            py = 0.4 + 0.02 * p_idx + np.random.normal(0, 0.01)
            tracks.append({
                "track_id": p_idx + 3,
                "category": "person",
                "bbox": [px, py, px + 0.06, py + 0.15],
                "velocity": [np.random.normal(0, 0.002), np.random.normal(0, 0.002)]
            })
        frames_data.append(tracks)

    start_time = time.time()
    for f in range(num_frames):
        classified = engine.classify_roles(frames_data[f])
        state = engine.detect_event_state(classified, f)
        engine.calculate_crop(classified, state)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("============================================")

if __name__ == "__main__":
    run_benchmark()
