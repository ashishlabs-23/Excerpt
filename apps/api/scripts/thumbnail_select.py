import cv2
import sys
import os
import numpy as np

def analyze_frame(frame):
    # Convert to grayscale for analysis
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # 1. Sharpness (Laplacian variance)
    sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
    
    # 2. Contrast (Standard deviation)
    contrast = gray.std()
    
    # 3. Brightness (Mean)
    brightness = gray.mean()
    
    # Scoring: High sharpness and high contrast are good. 
    # Avoid extremely dark or extremely bright frames.
    brightness_score = 1.0
    if brightness < 40 or brightness > 220:
        brightness_score = 0.5
        
    score = (sharpness * 0.6) + (contrast * 0.4)
    return score * brightness_score

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 thumbnail_select.py <video_path> <output_dir>")
        sys.exit(1)

    video_path = sys.argv[1]
    output_dir = sys.argv[2]
    
    import time
    cap = None
    for attempt in range(5):
        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            break
        print(f"Warning: Could not open video on attempt {attempt + 1}. Retrying...")
        if cap:
            cap.release()
        time.sleep(1.5)
        
    if cap is None or not cap.isOpened():
        print("Error: Could not open video after 5 attempts.")
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    # Pick 10 candidates evenly distributed
    candidates = np.linspace(0, total_frames - 1, 10, dtype=int)
    
    best_score = -1
    best_frame = None
    best_index = 0

    for idx in candidates:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue
            
        score = analyze_frame(frame)
        if score > best_score:
            best_score = score
            best_frame = frame
            best_index = idx

    if best_frame is not None:
        out_path = os.path.join(output_dir, "thumbnail.jpg")
        cv2.imwrite(out_path, best_frame)
        print(f"SUCCESS: Thumbnail saved to {out_path} (Frame {best_index}, Score {best_score:.2f})")
    else:
        print("FAILED: Could not extract any frames.")
        sys.exit(1)

    cap.release()

if __name__ == "__main__":
    main()
