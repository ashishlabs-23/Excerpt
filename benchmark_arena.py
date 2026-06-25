import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from excerpt_arena import ExcerptArena

def run_benchmark(num_tournaments=1000):
    print("=== Excerpt Arena Evaluation Suite Benchmark ===")
    print(f"Tournaments to run: {num_tournaments}")
    
    arena = ExcerptArena()
    
    # Pre-generate simulated matches dataset
    datasets = []
    for t in range(num_tournaments):
        datasets.append({
            "baseline": {"crops_score": 40.0 + np.random.normal(0, 5.0), "captions_score": 40.0, "story_score": 40.0, "retention_score": 40.0},
            "heuristic": {"crops_score": 65.0 + np.random.normal(0, 5.0), "captions_score": 65.0, "story_score": 65.0, "retention_score": 65.0},
            "orchestrated": {"crops_score": 90.0 + np.random.normal(0, 3.0), "captions_score": 90.0, "story_score": 90.0, "retention_score": 90.0}
        })

    start_time = time.time()
    arena.run_matchups(datasets)
    report = arena.generate_report()
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_tournaments / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} matchups/sec")
    print(f"Time per matchup: {duration * 1000 / num_tournaments:.4f} ms/matchup")
    print(f"Final Ratings: {report['ratings']}")
    print("=================================================")

if __name__ == "__main__":
    run_benchmark()
