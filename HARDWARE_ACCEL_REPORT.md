# HARDWARE ACCELERATION AUDIT

## Goal
Detect and verify empirical support for hardware-accelerated video encoding on the current host machine, moving beyond theoretical assumptions.

## 1. FFmpeg Binary Capabilities
The local FFmpeg binary (`ffmpeg version 8.1-full_build-www.gyan.dev`) was audited for compiled hardware encoders.
- **NVENC (Nvidia)**: Supported by binary (`h264_nvenc`, `hevc_nvenc`, `av1_nvenc`)
- **AMF (AMD)**: Supported by binary (`h264_amf`, `hevc_amf`, `av1_amf`)
- **QSV (Intel)**: Supported by binary (`h264_qsv`, `hevc_qsv`, `av1_qsv`)
- **VideoToolbox (Apple)**: Not supported (Windows build)

## 2. Host Hardware Capabilities
A WMI query against `Win32_VideoController` revealed the following installed GPU:
- **Intel(R) UHD Graphics**

There are no NVIDIA or AMD discrete GPUs present on the system. Therefore, `NVENC` and `AMF` will fail at runtime.

## 3. Runtime Verification (Intel QSV)
I executed a synthetic render test forcing the `h264_qsv` encoder:
`ffmpeg -f lavfi -i color=c=black:s=1280x720:d=1 -c:v h264_qsv -y qsv_test.mp4`

**Result**: **SUCCESS**.
The encoder successfully initialized and utilized the Intel Quick Sync Video silicon to output a valid MP4 file.

## Conclusion
- **Supported?** YES (Intel QSV only).
- **Configured?** YES (Local FFmpeg binary has the necessary libraries).
- **Actually Used?** NO. The pipeline currently hardcodes `libx264` (CPU).

**Recommendation**: We have the option to switch the `-c:v libx264` flag to `-c:v h264_qsv` for an immediate hardware acceleration boost on this specific machine. However, this binds the application to Intel hardware unless we implement an auto-fallback probing mechanism.
