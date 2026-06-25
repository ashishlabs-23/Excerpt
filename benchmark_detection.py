import os
import sys
import json
import time
import shutil
import subprocess
from pathlib import Path
import numpy as np
import cv2

def create_synthetic_frames(output_dir, count=20):
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[Benchmark]: Generating {count} synthetic test frames...")
    
    for i in range(count):
        # Create a blank black frame
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Draw some mock objects (shapes)
        # Red circle (representing sports ball)
        cv2.circle(frame, (100 + i * 15, 200), 30, (0, 0, 255), -1)
        # Blue rectangle (representing screen/laptop)
        cv2.rectangle(frame, (300, 100), (500, 350), (255, 0, 0), -1)
        # Green rectangle (representing whiteboard)
        cv2.rectangle(frame, (50, 50), (600, 400), (0, 255, 0), 2)
        
        # Save frame
        fpath = output_dir / f"frame_{i:04d}.jpg"
        cv2.imwrite(str(fpath), frame)
    print(f"[Benchmark]: Synthetic frames generated at {output_dir}")

def run_benchmark():
    test_dir = Path("temp/benchmark_frames")
    create_synthetic_frames(test_dir, count=15)
    
    script_path = "apps/api/scripts/detection_service.py"
    
    print("\n" + "="*50)
    print("STARTING DETECTION SERVICE BENCHMARK")
    print("="*50)
    
    # Test CPU fallback
    print("\nRunning CPU Benchmark Mode...")
    cmd_cpu = ["python", script_path, "--frames", str(test_dir), "--cpu", "--batch-size", "4"]
    
    start_time = time.time()
    try:
        out_cpu = subprocess.check_output(cmd_cpu).decode("utf-8")
        duration_cpu = time.time() - start_time
        res_cpu = json.loads(out_cpu)
        
        print(f"CPU Duration: {duration_cpu:.3f} seconds")
        print(f"CPU FPS: {res_cpu.get('fps')} frames/sec")
        print(f"CPU Status: {res_cpu.get('status')}")
        
        # Validate schema
        assert "results" in res_cpu, "Missing 'results' key in output JSON"
        assert len(res_cpu["results"]) > 0, "No frame detections returned"
        print("[OK] Output JSON schema validated successfully")
        
    except Exception as e:
        print(f"CPU Benchmark failed: {e}")
        if 'out_cpu' in locals():
            print(f"Stdout was:\n{out_cpu}")
            
    # Test default mode (GPU if available)
    print("\nRunning Default (GPU-Preferred) Mode...")
    cmd_gpu = ["python", script_path, "--frames", str(test_dir), "--batch-size", "4"]
    
    start_time = time.time()
    try:
        out_gpu = subprocess.check_output(cmd_gpu).decode("utf-8")
        duration_gpu = time.time() - start_time
        res_gpu = json.loads(out_gpu)
        
        print(f"GPU-Preferred Duration: {duration_gpu:.3f} seconds")
        print(f"GPU-Preferred FPS: {res_gpu.get('fps')} frames/sec")
        print(f"GPU-Preferred Status: {res_gpu.get('status')}")
    except Exception as e:
        print(f"GPU-Preferred Benchmark warning/skipped: {e}")
        
    print("\nCleaning up benchmark directory...")
    shutil.rmtree(test_dir, ignore_errors=True)
    print("="*50)
    print("BENCHMARK COMPLETED")
    print("="*50)

if __name__ == "__main__":
    run_benchmark()
