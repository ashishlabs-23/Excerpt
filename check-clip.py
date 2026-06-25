import cv2
import sys

video_path = "apps/api/temp/clips/98d8cd72-e8f4-4ad7-b842-996c2c4a8b16/3792b1ec-b91d-4315-a4ba-77360a8d2582.mp4"
cap = cv2.VideoCapture(video_path)

if not cap.isOpened():
    print("Error: Could not open video.")
    sys.exit()

width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = cap.get(cv2.CAP_PROP_FPS)
frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

print(f"Resolution: {width}x{height}")
print(f"FPS: {fps}")
print(f"Total Frames: {frames}")
print(f"Duration: {frames / fps:.2f} seconds")

# Read middle frame
cap.set(cv2.CAP_PROP_POS_FRAMES, frames // 2)
ret, frame = cap.read()
if ret:
    print(f"Middle frame shape: {frame.shape}")
    print(f"Middle frame mean color/brightness: {frame.mean()}")
else:
    print("Error: Could not read frame.")
cap.release()
