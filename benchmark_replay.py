import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from replay_detection_engine import ReplayDetectionEngine

def run_benchmark(num_frames=1000):
    print("=== Replay Detection Engine Benchmark ===")
    print(f"Frames to analyze: {num_frames}")
    
    engine = ReplayDetectionEngine()
    
    # Pre-generate simulated frame sequence
    timeline = []
    for f in range(num_frames):
        # Normal speed velocity dx=0.02, slow-mo is dx=0.004
        is_slow = (300 <= f < 600)
        dx = 0.004 if is_slow else 0.02
        bx = 0.1 + f * dx
        
        timeline.append({
            "timestamp": f / 30.0,
            "tracking": [{"category": "sports ball", "bbox": [bx, 0.5, bx + 0.02, 0.52]}],
            "visual": {"logo_overlay_detected": (f == 300 or f == 600)},
            "motion": {"magnitude": 0.01}
        })

    start_time = time.time()
    results = engine.process_timeline(timeline)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("=========================================")

if __name__ == "__main__":
    run_benchmark()
