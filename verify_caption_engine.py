import os
import sys
import json
import subprocess
from pathlib import Path

def test_caption_compilation():
    print("=== Subtitle Caption Engine Verification ===")
    
    # 1. Generate sample word timestamps input JSON
    sample_words = [
        {"word": "This", "start": 0.12, "end": 0.45},
        {"word": "unbelievable", "start": 0.46, "end": 0.98},
        {"word": "moment", "start": 0.99, "end": 1.45},
        {"word": "is", "start": 1.46, "end": 1.80},
        {"word": "pure", "start": 1.81, "end": 2.15},
        {"word": "fire", "start": 2.16, "end": 2.80}
    ]
    
    words_json_path = Path("temp/sample_words.json")
    words_json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(words_json_path, "w", encoding="utf-8") as f:
        json.dump({"words": sample_words}, f)
        
    compiled_ass_path = Path("temp/sample_captions.ass")
    script_path = "apps/api/scripts/caption_engine.py"
    
    # 2. Compile ASS for TikTok preset
    print("\n[1/3] Compiling subtitles for TikTok format...")
    cmd = ["python", script_path, "--words-json", str(words_json_path), "--output", str(compiled_ass_path), "--preset", "tiktok"]
    
    try:
        out = subprocess.check_output(cmd).decode("utf-8")
        res = json.loads(out)
        print(f"Compilation status: {res.get('status')}")
        print(f"Output File: {res.get('output_file')}")
        
        # Verify file content exists
        if compiled_ass_path.exists():
            print("\n[2/3] Verifying generated ASS event formats (sample lines):")
            with open(compiled_ass_path, "r", encoding="utf-8") as f:
                lines = f.readlines()
                # Print V4+ style format line and the last few dialogue events
                for line in lines:
                    if line.startswith("Style:") or line.startswith("Dialogue:"):
                        clean_line = line.strip().encode(sys.stdout.encoding or 'ascii', errors='replace').decode(sys.stdout.encoding or 'ascii')
                        print(f"  {clean_line}")
        else:
            print("FAILED: Compiled ASS file not found.")
            
    except Exception as e:
        print(f"Failed to execute caption compiler: {e}")
        if 'out' in locals():
            print(f"Stdout was:\n{out}")

    # 3. Print optimized FFmpeg GPU integration command
    print("\n" + "="*60)
    print("[3/3] PRODUCTION FFmpeg GPU-ACCELERATED MERGE COMMAND")
    print("="*60)
    print("To overlay ASS subtitles at hardware-accelerated speeds directly on the GPU, run:")
    print("\n  ffmpeg -hwaccel cuda -hwaccel_output_format cuda \\")
    print("    -ss 0.0 -i input.mp4 -t 15.0 \\")
    print("    -vf \"scale_npp=1080:1920:format=yuv420p,hwdownload,format=yuv420p,ass=temp/sample_captions.ass\" \\")
    print("    -c:v h264_nvenc -preset slow -crf 19 \\")
    print("    -c:a aac -b:a 192k -y output.mp4")
    print("="*60 + "\n")

    # Cleanup
    if words_json_path.exists():
        words_json_path.unlink()
    if compiled_ass_path.exists():
        compiled_ass_path.unlink()

if __name__ == "__main__":
    test_caption_compilation()
