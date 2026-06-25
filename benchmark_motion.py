import sys
import time
import numpy as np

sys.path.append("apps/api/scripts")
from motion_engine import MotionIntelligenceEngine

def run_benchmark(num_frames=100):
    print("=== Motion Intelligence Engine Benchmark ===")
    print(f"Frames to evaluate: {num_frames}")
    
    engine = MotionIntelligenceEngine(grid_size=8)
    
    h, w = 180, 320
    # Generate simulated video frames
    prev_gray = np.random.randint(0, 255, (h, w), dtype=np.uint8)
    
    start_time = time.time()
    for f in range(num_frames):
        # Shift slightly to create simulated optical flow
        curr_gray = np.roll(prev_gray, shift=1, axis=1) # Translation right
        engine.calculate_frame_motion(prev_gray, curr_gray)
        prev_gray = curr_gray
    end_time = time.time()
    
    duration = end_time - start_time
    fps = num_frames / duration
    
    print(f"Benchmarking completed in: {duration:.4f} seconds")
    print(f"Throughput: {fps:.2f} FPS")
    print(f"Time per frame: {duration * 1000 / num_frames:.4f} ms/frame")
    print("============================================")

if __name__ == "__main__":
    run_benchmark()
