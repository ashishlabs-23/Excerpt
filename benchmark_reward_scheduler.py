import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from reward_model import ExcerptRewardModel
from preference_scheduler import ExcerptPreferenceScheduler

def run_benchmark(num_iterations=1000):
    print("=== Preference Reward Model & Scheduler Benchmark ===")
    print(f"Iterations: {num_iterations}")
    
    model = ExcerptRewardModel()
    scheduler = ExcerptPreferenceScheduler()
    
    # Pre-generate simulated features
    features_list = []
    for f in range(num_iterations):
        features_list.append({
            "duration": 0.5 + np.random.normal(0, 0.1),
            "caption_density": 0.6,
            "avg_zoom": 0.5,
            "speaker_changes": 0.4,
            "emotion_peak": 0.8 + np.random.normal(0, 0.05),
            "motion_peak": 0.7,
            "story_completeness": 0.8,
            "hook_strength": 0.8
        })

    start_time = time.time()
    for f in range(num_iterations):
        # 1. Predict
        res = model.predict_reward(features_list[f], {"video_type": "football"})
        # 2. Schedule
        scheduler.evaluate_clip_for_human_vote(res, 85.0, {"video_type": "football"})
    end_time = time.time()
    
    duration = end_time - start_time
    throughput = num_iterations / duration
    
    print(f"Benchmarking completed in: {duration:.6f} seconds")
    print(f"Throughput: {throughput:.2f} frames/sec")
    print(f"Time per frame: {duration * 1000 / num_iterations:.4f} ms/frame")
    print("=====================================================")

if __name__ == "__main__":
    run_benchmark()
