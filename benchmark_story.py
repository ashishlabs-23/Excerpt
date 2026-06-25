import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from story_engine import StoryArcEngine

def run_benchmark(num_segments=100):
    print("=== Story Arc Engine Benchmark ===")
    print(f"Segments to analyze: {num_segments}")
    
    engine = StoryArcEngine()
    
    # Pre-generate simulated segments data
    segments = []
    for s in range(num_segments):
        # Setup transcript
        transcript = "This is a random sentence showing some narrative context."
        if s == num_segments // 2:
            transcript = "Suddenly, an incredible and unbelievable thing happened!"
            
        events = []
        if s == num_segments // 2:
            events = ["goal"]
        elif s > num_segments // 2:
            events = ["celebration"]
            
        motion = {
            "magnitude": 0.01 + np.random.normal(0, 0.005),
            "density": 0.3
        }
        
        emotion = {
            "surprise": 0.8 if (s == num_segments // 2) else 0.1,
            "joy": 0.9 if (s >= num_segments // 2) else 0.1,
            "arousal": 0.5
        }
        
        segments.append({
            "timestamp": s * 2.0,
            "duration": 2.0,
            "transcript": transcript,
            "motion": motion,
            "emotion": emotion,
            "events": events
        })

    start_time = time.time()
    results = engine.analyze_timeline(segments)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_segments / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} segments/sec")
    print(f"Time per segment: {duration * 1000 / num_segments:.4f} ms/segment")
    print("==================================")

if __name__ == "__main__":
    run_benchmark()
