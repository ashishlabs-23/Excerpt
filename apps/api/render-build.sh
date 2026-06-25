#!/usr/bin/env bash
# render-build.sh — Installs system deps (FFmpeg, yt-dlp) then builds the API
# Runs automatically during Render.com build phase

set -e

echo "=== [Render Build] Installing system dependencies ==="

# Install FFmpeg via apt (available on Render's Ubuntu build environment)
apt-get update -qq
apt-get install -y -qq ffmpeg

# Verify FFmpeg installed
ffmpeg -version | head -1
ffprobe -version | head -1

echo "=== [Render Build] Installing yt-dlp ==="

# Install yt-dlp (latest stable)
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version

echo "=== [Render Build] Installing Node dependencies ==="
npm install

echo "=== [Render Build] Compiling TypeScript ==="
npm run build

echo "=== [Render Build] Complete! ==="
