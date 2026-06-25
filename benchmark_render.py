import sys
import time
import os
import tempfile

sys.path.append("apps/api/scripts")
from render_engine import GPURenderEngine

def run_benchmark(num_frames=3600): # 2 minutes at 30 fps
    print("=== GPU Render Engine Command Generator Benchmark ===")
    print(f"Frames to crop: {num_frames}")
    
    engine = GPURenderEngine(width=1920, height=1080)
    
    # Pre-generate simulated crop events
    crops = []
    for f in range(num_frames):
        crops.append({
            "time": f / 30.0,
            "crop": {
                "w": 608,
                "h": 1080,
                "x": 300 + (f % 50),
                "y": 0
            }
        })

    with tempfile.TemporaryDirectory() as tmpdir:
        sendcmd_path = os.path.join(tmpdir, "sendcmd.txt")
        
        # 1. Benchmark sendcmd file generation
        t_start = time.time()
        engine.generate_sendcmd_file(crops, sendcmd_path)
        t_end = time.time()
        
        print(f"Generated sendcmd file in: {t_end - t_start:.4f} seconds")
        
        # 2. Benchmark command building
        t_start = time.time()
        cmd = engine.build_ffmpeg_command(
            input_path="input.mp4",
            output_path="output.mp4",
            sendcmd_path=sendcmd_path,
            ass_path=os.path.join(tmpdir, "captions.ass"),
            use_gpu=True
        )
        t_end = time.time()
        
        print(f"Compiled FFmpeg GPU command in: {(t_end - t_start) * 1000:.4f} ms")
        print("=====================================================")

if __name__ == "__main__":
    run_benchmark()
