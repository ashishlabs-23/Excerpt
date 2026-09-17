import os
import sys
import json
import argparse
import subprocess

class GPURenderEngine:
    def __init__(self, width=1920, height=1080, out_width=1080, out_height=1920):
        self.W = width
        self.H = height
        self.out_W = out_width
        self.out_H = out_height

    def generate_sendcmd_file(self, crop_results, sendcmd_path):
        """
        Generates an FFmpeg sendcmd instructions text file containing frame-level dynamic crops.
        """
        commands = []
        # Support both frames list and general dict
        results = crop_results.get("results", []) if isinstance(crop_results, dict) else crop_results

        for idx, entry in enumerate(results):
            crop = entry["crop"]
            # Time in seconds (assuming 30 FPS tracking if time is missing)
            time_sec = entry.get("time", idx / 30.0)
            
            # Format: [time] crop [param] [value]
            # In sendcmd, multiple parameters for the same filter are separated by commas
            cmd_line = f"{time_sec:.3f} crop w {crop['w']}, crop h {crop['h']}, crop x {crop['x']}, crop y {crop['y']};"
            commands.append(cmd_line)

        with open(sendcmd_path, "w", encoding="utf-8") as f:
            f.write("\n".join(commands) + "\n")
            
        print(f"[Render Engine]: Generated sendcmd commands file at {sendcmd_path}", file=sys.stderr)

    def build_ffmpeg_command(self, input_path, output_path, sendcmd_path, ass_path=None, use_gpu=True):
        """
        Builds the optimized FFmpeg command using NVDEC/NVENC and scale_npp.
        """
        cmd = ["ffmpeg"]

        # 1. GPU Hardware Acceleration (NVDEC decoding)
        if use_gpu:
            cmd.extend([
                "-hwaccel", "cuda",
                "-hwaccel_output_format", "cuda"
            ])

        cmd.extend(["-i", str(input_path)])

        # 2. Build Hybrid GPU-CPU Filtergraph
        # We must download frames to CPU memory (hwdownload) to apply the crop and ass caption filters,
        # then upload back to GPU (hwupload_cuda) to perform high-speed scaling (scale_npp) and encoding.
        filters = []
        
        # Add dynamic crop command file
        filters.append(f"sendcmd=f='{sendcmd_path}'")
        
        if use_gpu:
            # Download to system memory
            filters.append("hwdownload")
            filters.append("format=nv12")
            
        # Apply crop (starting parameters default to center 9:16)
        init_h = self.H
        init_w = int(init_h * (9.0 / 16.0))
        init_x = int((self.W - init_w) / 2.0)
        init_y = 0
        filters.append(f"crop=w={init_w}:h={init_h}:x={init_x}:y={init_y}")
        
        # Burn ASS subtitles
        if ass_path and os.path.exists(ass_path):
            # Escape path for FFmpeg filter
            clean_ass = str(ass_path).replace("\\", "/").replace(":", "\\:")
            filters.append(f"ass='{clean_ass}'")
            
        if use_gpu:
            # Upload back to GPU CUDA cores
            filters.append("hwupload_cuda")
            # NPP high-speed hardware scaling
            filters.append(f"scale_npp={self.out_W}:{self.out_H}:format=yuv420p")
        else:
            # CPU fallback scaling
            filters.append(f"scale={self.out_W}:{self.out_H}")

        filtergraph = ",".join(filters)
        cmd.extend(["-vf", filtergraph])

        # 3. Video & Audio Encoding (NVENC vs CPU encoding)
        if use_gpu:
            cmd.extend([
                "-c:v", "h264_nvenc",
                "-preset", "slow",
                "-profile:v", "high",
                "-spatial-aq", "1",
                "-temporal-aq", "1",
                "-cq", "19",
                "-bf", "2"
            ])
        else:
            cmd.extend([
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "19"
            ])

        # Audio settings
        cmd.extend([
            "-c:a", "aac",
            "-b:a", "192k",
            "-y",
            str(output_path)
        ])

        return cmd

def main():
    parser = argparse.ArgumentParser(description="GPU Accelerated FFmpeg Rendering Service")
    parser.add_argument("--input", required=True, help="Path to input source MP4 video")
    parser.add_argument("--output", required=True, help="Path to write output vertical MP4 video")
    parser.add_argument("--crops-json", required=True, help="Path to reframed crops JSON file")
    parser.add_argument("--ass-path", help="Path to compiled ASS subtitles file")
    parser.add_argument("--cpu", action="store_true", help="Force CPU rendering fallback")
    args = parser.parse_args()

    # Paths
    temp_sendcmd = os.path.splitext(args.output)[0] + "_sendcmd.txt"

    try:
        with open(args.crops_json, "r", encoding="utf-8") as f:
            crops_data = json.load(f)

        engine = GPURenderEngine()
        engine.generate_sendcmd_file(crops_data, temp_sendcmd)
        
        ffmpeg_cmd = engine.build_ffmpeg_command(
            input_path=args.input,
            output_path=args.output,
            sendcmd_path=temp_sendcmd,
            ass_path=args.ass_path,
            use_gpu=not args.cpu
        )

        print(json.dumps({
            "status": "success",
            "sendcmd_file": temp_sendcmd,
            "ffmpeg_command": " ".join(ffmpeg_cmd)
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
