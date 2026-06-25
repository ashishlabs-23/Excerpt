import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from editor_agent import ExcerptEditorAgent

def run_benchmark(num_frames=1000):
    print("=== Excerpt Editor Agent Benchmark ===")
    print(f"Frames to analyze: {num_frames}")
    
    agent = ExcerptEditorAgent(target_platform="tiktok", video_type="football")
    
    # Pre-generate simulated frame timeline
    timeline = []
    for f in range(num_frames):
        timeline.append({
            "timestamp": f * 1.0,
            "story_stage": "CLIMAX" if (f % 100 == 50) else "SETUP",
            "events": ["goal"] if (f % 100 == 50) else [],
            "emotion": {"excitement": 0.9 if (f % 100 == 50) else 0.1}
        })

    start_time = time.time()
    candidate_plans = agent.generate_candidate_plans(timeline)
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} frames/sec")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print(f"Generated plans count: {len(candidate_plans)}")
    print("=======================================")

if __name__ == "__main__":
    run_benchmark()
