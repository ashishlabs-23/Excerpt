import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from critic_engine import CriticEngine

def run_benchmark(num_frames=100):
    print("=== Quality Reviewer Critic Engine Benchmark ===")
    print(f"Frames to review: {num_frames}")
    
    engine = CriticEngine()
    
    # Pre-generate simulated payload containing list of frames
    crops = []
    tracks = []
    emotions = []
    
    for f in range(num_frames):
        crops.append({"x": 0.2, "y": 0.2, "w": 0.5, "h": 0.5})
        tracks.append({
            "tracks": [{"category": "person", "track_id": 1, "bbox": [0.3 + f * 0.001, 0.3, 0.4 + f * 0.001, 0.4]}]
        })
        emotions.append({"confidence": 0.9, "primary_emotion": "excitement"})
        
    payload = {
        "crops": crops,
        "tracks": tracks,
        "captions": [{"text": "Hello world.", "confidence": 0.9} for _ in range(10)],
        "story_arc": [{"stage": "Setup"}, {"stage": "Climax"}, {"stage": "Payoff"}],
        "retention": {"completion_rate": 0.82},
        "emotions": emotions
    }

    start_time = time.time()
    results = engine.evaluate_clip(payload)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} frames/sec")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("================================================")

if __name__ == "__main__":
    run_benchmark()
