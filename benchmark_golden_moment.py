import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from golden_moment_engine import GoldenMomentEngine

def run_benchmark(num_segments=1000):
    print("=== Golden Moment Engine Benchmark ===")
    print(f"Segments to rank: {num_segments}")
    
    engine = GoldenMomentEngine()
    
    # Pre-generate simulated segment sequence
    timeline = []
    for s in range(num_segments):
        timeline.append({
            "timestamp": s * 2.0,
            "speech": "This is a random sentence showing some narrative context.",
            "emotion": {
                "surprise": 0.1 + np.random.normal(0, 0.05),
                "shock": 0.1,
                "joy": 0.2
            },
            "motion": {
                "magnitude": 0.01 + np.random.normal(0, 0.005),
                "density": 0.3
            },
            "events": [],
            "attention": {"focus_density": 0.5},
            "audio_db": 60.0 + np.random.normal(0, 5.0)
        })

    start_time = time.time()
    results = engine.process_timeline(timeline)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_segments / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} segments/sec")
    print(f"Time per segment: {duration * 1000 / num_segments:.4f} ms/segment")
    print("======================================")

if __name__ == "__main__":
    run_benchmark()
