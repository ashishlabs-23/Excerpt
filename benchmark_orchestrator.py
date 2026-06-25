import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from excerpt_intelligence_orchestrator import ExcerptIntelligenceOrchestrator

def run_benchmark(num_frames=1000):
    print("=== Excerpt Intelligence Orchestrator Benchmark ===")
    print(f"Frames to orchestrate: {num_frames}")
    
    orchestrator = ExcerptIntelligenceOrchestrator(platform="tiktok", target_sport="football")
    
    # Pre-generate simulated frame sequence
    raw_frames = []
    for f in range(num_frames):
        is_peak = (f % 100 == 50)
        raw_frames.append({
            "speech_detected": True,
            "words_count": 3,
            "tracks": [{"category": "person", "bbox": [0.1, 0.1, 0.2, 0.2]}],
            "audio_energy": 0.9 if is_peak else 0.1,
            "motion_magnitude": 0.08 if is_peak else 0.01,
            "curiosity_score": 0.8 if is_peak else 0.1
        })

    start_time = time.time()
    results = orchestrator.execute_pipeline(raw_frames)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} frames/sec")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("===================================================")

if __name__ == "__main__":
    run_benchmark()
