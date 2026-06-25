import os
import sys
import json
import time
import subprocess
from pathlib import Path

def run_benchmark():
    # Setup mock audio input
    test_audio = Path("temp/benchmark_audio.mp3")
    test_audio.parent.mkdir(parents=True, exist_ok=True)
    with open(test_audio, 'w') as f:
        f.write("MOCK MP3 DATA")

    script_path = "apps/api/scripts/transcript_service.py"
    
    print("\n" + "="*50)
    print("STARTING TRANSCRIPT SERVICE BENCHMARK")
    print("="*50)
    
    # Test CPU execution
    print("\nRunning CPU Mode...")
    cmd_cpu = ["python", script_path, "--audio", str(test_audio), "--cpu"]
    start_time = time.time()
    try:
        out_cpu = subprocess.check_output(cmd_cpu).decode("utf-8")
        duration_cpu = time.time() - start_time
        res_cpu = json.loads(out_cpu)
        
        print(f"[OK] CPU duration: {duration_cpu:.3f} seconds")
        print(f"[OK] CPU processing_time: {res_cpu.get('transcription_time_sec')} seconds")
        print(f"[OK] Status: {res_cpu.get('status')}")
        print(f"[OK] Total words aligned: {len(res_cpu.get('words', []))}")
        
    except Exception as e:
        print(f"CPU Benchmark failed: {e}")
        if 'out_cpu' in locals():
            print(f"Output was:\n{out_cpu}")

    # Test Default GPU-preferred execution
    print("\nRunning GPU-Preferred Mode...")
    cmd_gpu = ["python", script_path, "--audio", str(test_audio)]
    start_time = time.time()
    try:
        out_gpu = subprocess.check_output(cmd_gpu).decode("utf-8")
        duration_gpu = time.time() - start_time
        res_gpu = json.loads(out_gpu)
        
        print(f"[OK] GPU duration: {duration_gpu:.3f} seconds")
        print(f"[OK] GPU status: {res_gpu.get('status')}")
    except Exception as e:
        print(f"GPU Mode warning/skipped: {e}")

    # Cleanup
    if test_audio.exists():
        test_audio.unlink()
        
    print("\n" + "="*50)
    print("TRANSCRIPT BENCHMARK COMPLETED")
    print("="*50)

if __name__ == "__main__":
    run_benchmark()
