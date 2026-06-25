import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from event_engine import MultimodalEventEngine

def run_benchmark(num_frames=1000, num_players=10):
    print("=== Multimodal Event Detection Engine Benchmark ===")
    print(f"Frames: {num_frames}, Players per Frame: {num_players}")
    
    engine = MultimodalEventEngine(sport="football")
    
    # Pre-generate simulated tracks data per frame
    frames_data = []
    for f in range(num_frames):
        # Audio
        audio = {
            "db": 60.0 + np.random.normal(0, 5.0),
            "spectral_flux": 0.5 + np.random.normal(0, 0.1)
        }
        # Motion
        motion = {
            "magnitude": 0.01 + np.random.normal(0, 0.005),
            "density": 0.5
        }
        # Tracking
        tracks = []
        for p_idx in range(num_players):
            px = 0.2 + 0.05 * p_idx + np.random.normal(0, 0.01)
            py = 0.4 + 0.02 * p_idx + np.random.normal(0, 0.01)
            tracks.append({
                "track_id": p_idx + 2,
                "category": "person",
                "bbox": [px, py, px + 0.06, py + 0.15]
            })
            
        # Ball Data
        ball_data = {
            "ball_position": [0.1 + f * 0.0005, 0.5],
            "events": {
                "anticipated_pass": (f % 50 == 0),
                "anticipated_shot": (f % 100 == 0),
                "impact": (f % 25 == 0)
            }
        }
        
        frames_data.append({
            "frame_idx": f,
            "frame": f"frame_{f:04d}.jpg",
            "audio": audio,
            "motion": motion,
            "tracking": tracks,
            "ball_data": ball_data
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
