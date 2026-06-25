import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from moment_engine import GoldenMomentEngine

def run_benchmark(num_segments=1000):
    print("=== Golden Moment Engine Benchmark ===")
    print(f"Segments to evaluate: {num_segments}")
    
    engine = GoldenMomentEngine()
    
    # Pre-generate simulated segment metrics
    segments = []
    for s_idx in range(num_segments):
        # Alternate text styles
        text = "This is a standard speech."
        if s_idx % 5 == 1:
            text = "Haha that is so funny! [laughter]"
        elif s_idx % 5 == 2:
            text = "Look at this unboxing, introducing the product!"
        elif s_idx % 5 == 3:
            text = "I disagree! You are wrong, that is a fake lie."
        elif s_idx % 5 == 4:
            text = "Unbelievable [laughter] introducing finally revealed unboxing!"
            
        segments.append({
            "id": f"seg_{s_idx}",
            "start": s_idx * 5.0,
            "end": (s_idx + 1) * 5.0,
            "text": text,
            "audio": {
                "volume_transient": np.random.uniform(0.0, 0.9),
                "volume_peak": np.random.uniform(0.1, 0.8),
                "applause": np.random.uniform(0.0, 0.5)
            },
            "visual": {
                "motion_transient": np.random.uniform(0.0, 0.9)
            },
            "emotion": {
                "positive_sentiment": np.random.uniform(0.0, 0.8),
                "negative_sentiment": np.random.uniform(0.0, 0.8)
            }
        })

    start_time = time.time()
    engine.process_timeline(segments)
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_segments / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} segments/sec")
    print(f"Time per segment: {duration * 1000 / num_segments:.4f} ms/segment")
    print("======================================")

if __name__ == "__main__":
    run_benchmark()
