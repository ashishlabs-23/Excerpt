import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from editor_emulation_engine import EditorEmulationEngine

def run_benchmark(num_segments=1000):
    print("=== Editor Emulation Engine Benchmark ===")
    print(f"Segments to analyze: {num_segments}")
    
    engine = EditorEmulationEngine(broadcaster="espn")
    
    # Pre-generate simulated timeline segments
    timeline = []
    for s in range(num_segments):
        events = []
        stage = "Setup"
        
        if s % 100 == 50:
            stage = "Climax"
            events = ["goal"]
        elif s % 100 > 50 and s % 100 < 70:
            stage = "Payoff"
            events = ["celebration"]
        elif s % 100 >= 70:
            stage = "Setup"
        else:
            stage = "Build-up"
            
        timeline.append({
            "timestamp": s * 2.0,
            "stage": stage,
            "intensity": 0.2 + (0.7 if stage == "Climax" else 0.1),
            "events": events
        })

    start_time = time.time()
    decisions = engine.recommend_decisions(timeline)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_segments / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} segments/sec")
    print(f"Time per segment: {duration * 1000 / num_segments:.4f} ms/segment")
    print("=========================================")

if __name__ == "__main__":
    run_benchmark()
