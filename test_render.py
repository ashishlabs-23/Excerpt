import sys
import os
import unittest
import tempfile
import json

sys.path.append("apps/api/scripts")
from render_engine import GPURenderEngine

class TestGPURenderEngine(unittest.TestCase):
    def test_sendcmd_file_generation(self):
        engine = GPURenderEngine(width=1920, height=1080)
        
        crops = [
            {"time": 0.0, "crop": {"w": 608, "h": 1080, "x": 320, "y": 0}},
            {"time": 0.5, "crop": {"w": 608, "h": 1080, "x": 322, "y": 0}}
        ]
        
        with tempfile.TemporaryDirectory() as tmpdir:
            sendcmd_path = os.path.join(tmpdir, "sendcmd.txt")
            engine.generate_sendcmd_file(crops, sendcmd_path)
            
            self.assertTrue(os.path.exists(sendcmd_path))
            
            with open(sendcmd_path, "r", encoding="utf-8") as f:
                content = f.read()
                
            lines = content.strip().split("\n")
            self.assertEqual(len(lines), 2)
            self.assertEqual(lines[0], "0.000 crop w 608, crop h 1080, crop x 320, crop y 0;")
            self.assertEqual(lines[1], "0.500 crop w 608, crop h 1080, crop x 322, crop y 0;")

    def test_ffmpeg_command_generation_gpu(self):
        engine = GPURenderEngine(width=1920, height=1080)
        
        with tempfile.NamedTemporaryFile(suffix=".ass", delete=False) as tmp_ass:
            tmp_ass_path = tmp_ass.name
            
        try:
            cmd = engine.build_ffmpeg_command(
                input_path="input.mp4",
                output_path="output.mp4",
                sendcmd_path="sendcmd.txt",
                ass_path=tmp_ass_path,
                use_gpu=True
            )
            
            cmd_str = " ".join(cmd)
            
            # Verify NVDEC/NVENC/NPP parameters
            self.assertIn("-hwaccel cuda", cmd_str)
            self.assertIn("-hwaccel_output_format cuda", cmd_str)
            self.assertIn("-c:v h264_nvenc", cmd_str)
            self.assertIn("scale_npp=1080:1920", cmd_str)
            
            # Verify hybrid filters are chained
            self.assertIn("sendcmd=f='sendcmd.txt'", cmd_str)
            self.assertIn("hwdownload", cmd_str)
            self.assertIn("hwupload_cuda", cmd_str)
            
            # Verify path escaping in filters
            escaped_path = tmp_ass_path.replace("\\", "/").replace(":", "\\:")
            self.assertIn(f"ass='{escaped_path}'", cmd_str)
        finally:
            if os.path.exists(tmp_ass_path):
                os.unlink(tmp_ass_path)

    def test_ffmpeg_command_generation_cpu_fallback(self):
        engine = GPURenderEngine(width=1920, height=1080)
        
        with tempfile.NamedTemporaryFile(suffix=".ass", delete=False) as tmp_ass:
            tmp_ass_path = tmp_ass.name
            
        try:
            cmd = engine.build_ffmpeg_command(
                input_path="input.mp4",
                output_path="output.mp4",
                sendcmd_path="sendcmd.txt",
                ass_path=tmp_ass_path,
                use_gpu=False
            )
            
            cmd_str = " ".join(cmd)
            
            # Verify CPU parameters
            self.assertNotIn("-hwaccel cuda", cmd_str)
            self.assertNotIn("scale_npp", cmd_str)
            self.assertIn("-c:v libx264", cmd_str)
            self.assertIn("scale=1080:1920", cmd_str)
            
            # Verify path escaping in filters
            escaped_path = tmp_ass_path.replace("\\", "/").replace(":", "\\:")
            self.assertIn(f"ass='{escaped_path}'", cmd_str)
        finally:
            if os.path.exists(tmp_ass_path):
                os.unlink(tmp_ass_path)

if __name__ == "__main__":
    unittest.main()
