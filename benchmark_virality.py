import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from virality_engine import CustomGBDTRegressor, ViralityPredictor

def run_benchmark(num_train_samples=200, num_infer_samples=1000):
    print("=== Virality Prediction Engine Benchmark ===")
    
    # 1. Benchmark Training speed
    np.random.seed(42)
    X_train = np.random.uniform(0.1, 1.0, (num_train_samples, 5))
    y_train = np.random.uniform(20.0, 98.0, num_train_samples)
    
    regressor = CustomGBDTRegressor(n_estimators=10, learning_rate=0.1, max_depth=3)
    
    t_start = time.time()
    regressor.fit(X_train, y_train)
    t_end = time.time()
    
    print(f"Model training (N={num_train_samples}) completed in: {t_end - t_start:.4f} seconds")

    # 2. Benchmark Inference speed
    X_infer = np.random.uniform(0.1, 1.0, (num_infer_samples, 5))
    
    t_start = time.time()
    preds = regressor.predict(X_infer)
    t_end = time.time()
    
    duration = t_end - t_start
    fps = num_infer_samples / duration
    
    print(f"Model inference (N={num_infer_samples}) completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per prediction: {duration * 1000 / num_infer_samples:.4f} ms/prediction")
    print("============================================")

if __name__ == "__main__":
    run_benchmark()
