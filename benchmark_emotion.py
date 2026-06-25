import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from emotion_engine import EmotionEngine

def run_benchmark(num_frames=1000):
    print("=== Emotion AI Engine Benchmark ===")
    print(f"Frames to analyze: {num_frames}")
    
    engine = EmotionEngine()
    
    # Pre-generate simulated frame sequence
    timeline = []
    for f in range(num_frames):
        face = {
            "smile_score": 0.5 + np.random.normal(0, 0.2),
            "brow_raise": 0.3 + np.random.normal(0, 0.1),
            "mouth_open": 0.4 + np.random.normal(0, 0.1)
        }
        voice = {
            "pitch_variance": 0.4 + np.random.normal(0, 0.1),
            "db": 60.0 + np.random.normal(0, 10.0),
            "speaking_pace": 0.5 + np.random.normal(0, 0.1)
        }
        crowd = {
            "cheering": 0.3 + np.random.normal(0, 0.1),
            "applause": 0.2 + np.random.normal(0, 0.1),
            "density": 0.5
        }
        
        timeline.append({
            "frame_idx": f,
            "timestamp": f / 30.0,
            "face_data": face,
            "voice_data": voice,
            "crowd_data": crowd
        })

    start_time = time.time()
    results = engine.process_timeline(timeline)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("===================================")

if __name__ == "__main__":
    run_benchmark()
