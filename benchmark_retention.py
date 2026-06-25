import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from retention_engine import RetentionPredictor

def run_benchmark(num_train_samples=200, num_infer_samples=1000):
    print("=== Multi-Target Retention Engine Benchmark ===")
    
    predictor = RetentionPredictor()
    
    # 1. Benchmark Training speed
    np.random.seed(42)
    X_train = np.random.uniform(0.1, 1.0, (num_train_samples, 12))
    
    # Target values
    y_watch = np.random.uniform(5.0, 50.0, num_train_samples)
    y_complete = np.random.uniform(0.1, 0.9, num_train_samples)
    y_replay = np.random.uniform(0.01, 0.5, num_train_samples)
    y_scroll = np.random.uniform(0.1, 0.9, num_train_samples)
    
    t_start = time.time()
    predictor.models["watch_time"].fit(X_train, y_watch)
    predictor.models["completion_rate"].fit(X_train, y_complete)
    predictor.models["replay_rate"].fit(X_train, y_replay)
    predictor.models["scroll_stop_rate"].fit(X_train, y_scroll)
    t_end = time.time()
    
    print(f"Multi-target training (N={num_train_samples}) completed in: {t_end - t_start:.4f} seconds")

    # 2. Benchmark Inference speed
    X_infer = np.random.uniform(0.1, 1.0, (num_infer_samples, 12))
    
    t_start = time.time()
    for f in range(num_infer_samples):
        # Package into feature dict
        sample_features = {
            predictor.feature_names[i]: float(X_infer[f, i])
            for i in range(12)
        }
        predictor.predict_all(sample_features)
    t_end = time.time()
    
    duration = t_end - t_start
    fps = num_infer_samples / duration
    
    print(f"Model inference (N={num_infer_samples}) completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per prediction: {duration * 1000 / num_infer_samples:.4f} ms/prediction")
    print("===============================================")

if __name__ == "__main__":
    run_benchmark()
