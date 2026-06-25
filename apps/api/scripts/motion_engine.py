import os
import sys
import json
import argparse
import numpy as np
import cv2

class MotionIntelligenceEngine:
    def __init__(self, grid_size=8, pan_threshold=1.5, zoom_threshold=0.8, var_threshold=2.0):
        self.grid_size = grid_size
        self.pan_threshold = pan_threshold
        self.zoom_threshold = zoom_threshold
        self.var_threshold = var_threshold

    def calculate_frame_motion(self, prev_gray, curr_gray):
        """
        Calculates optical flow and classifies pans, zooms, and action regions.
        """
        h, w = curr_gray.shape[:2]
        
        # 1. Compute dense Farneback optical flow
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        
        dx = flow[..., 0]
        dy = flow[..., 1]
        magnitude = np.sqrt(dx**2 + dy**2)

        # 2. Grid Aggregation (8x8 cells)
        cell_h = h / self.grid_size
        cell_w = w / self.grid_size
        
        grid_vectors = []
        high_motion_cells = []
        mean_mag_total = np.mean(magnitude)

        for r in range(self.grid_size):
            row_vectors = []
            y1, y2 = int(r * cell_h), int((r + 1) * cell_h)
            for c in range(self.grid_size):
                x1, x2 = int(c * cell_w), int((c + 1) * cell_w)
                
                cell_dx = np.mean(dx[y1:y2, x1:x2])
                cell_dy = np.mean(dy[y1:y2, x1:x2])
                cell_mag = np.sqrt(cell_dx**2 + cell_dy**2)
                
                row_vectors.append([round(float(cell_dx), 2), round(float(cell_dy), 2)])
                
                # Identify high-motion cells (greater than 2x mean magnitude)
                if cell_mag > max(1.0, mean_mag_total * 2.0):
                    high_motion_cells.append((c, r))
            grid_vectors.append(row_vectors)

        # 3. Classify Camera Movement (Pan and Zoom)
        cx, cy = w / 2.0, h / 2.0
        divergence = 0.0
        
        # Calculate radial divergence
        # div = sum( dx * (x - cx) + dy * (y - cy) )
        x_indices = np.linspace(0.0, w, w)
        y_indices = np.linspace(0.0, h, h)
        xx, yy = np.meshgrid(x_indices, y_indices)
        
        rx = xx - cx
        ry = yy - cy
        r_mag = np.sqrt(rx**2 + ry**2)
        r_mag[r_mag == 0] = 1.0  # Avoid division by zero
        
        # Radial unit vectors
        ux = rx / r_mag
        uy = ry / r_mag
        
        # Divergence projection
        proj = dx * ux + dy * uy
        divergence = float(np.mean(proj))

        # Check for Camera Pan
        mean_dx = float(np.mean(dx))
        mean_dy = float(np.mean(dy))
        var_dx = float(np.var(dx))
        var_dy = float(np.var(dy))
        
        camera_event = "Static"
        event_magnitude = 0.0

        flow_mag = np.sqrt(mean_dx**2 + mean_dy**2)
        if flow_mag > self.pan_threshold and (var_dx + var_dy) < self.var_threshold:
            camera_event = "Pan"
            event_magnitude = round(flow_mag, 2)
            # Add direction tag
            angle = np.arctan2(mean_dy, mean_dx) * 180 / np.pi
            if -45 <= angle < 45: camera_event += " Right"
            elif 45 <= angle < 135: camera_event += " Down"
            elif -135 <= angle < -45: camera_event += " Up"
            else: camera_event += " Left"
        # Check for Camera Zoom
        elif abs(divergence) > self.zoom_threshold:
            if divergence > 0:
                camera_event = "Zoom In"
            else:
                camera_event = "Zoom Out"
            event_magnitude = round(abs(divergence), 2)

        # 4. Extract Action Regions (bounding boxes of high-motion grids)
        action_regions = []
        if high_motion_cells:
            # Segment high motion cells into bounding boxes
            # Simple grouping: find min/max grid indices
            min_gc = min(c[0] for c in high_motion_cells)
            max_gc = max(c[0] for c in high_motion_cells)
            min_gr = min(c[1] for c in high_motion_cells)
            max_gr = max(c[1] for c in high_motion_cells)
            
            # Convert back to normalized coordinates [x1, y1, x2, y2]
            action_regions.append([
                round(min_gc / self.grid_size, 3),
                round(min_gr / self.grid_size, 3),
                round((max_gc + 1) / self.grid_size, 3),
                round((max_gr + 1) / self.grid_size, 3)
            ])

        # Compute motion density (fraction of moving pixels)
        motion_density = float(np.sum(magnitude > 1.0) / (h * w))

        return {
            "motion_vectors": grid_vectors,
            "motion_density": round(motion_density, 3),
            "camera_movement": {
                "event": camera_event,
                "magnitude": event_magnitude
            },
            "action_regions": action_regions
        }

    def process_video(self, video_path, output_json):
        """
        Reads video file and processes frame-by-frame optical flow.
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {video_path}")

        results = []
        frame_idx = 0
        prev_gray = None

        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Resize and grayscale for performance
            resized = cv2.resize(frame, (320, 180))
            gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
            
            if prev_gray is not None:
                motion_data = self.calculate_frame_motion(prev_gray, gray)
                results.append({
                    "frame": frame_idx,
                    "time": round(frame_idx / cap.get(cv2.CAP_PROP_FPS), 3) if cap.get(cv2.CAP_PROP_FPS) > 0 else frame_idx / 30.0,
                    "motion_density": motion_data["motion_density"],
                    "camera_movement": motion_data["camera_movement"],
                    "action_regions": motion_data["action_regions"],
                    "motion_vectors": motion_data["motion_vectors"]
                })
                
            prev_gray = gray
            frame_idx += 1

        cap.release()

        # Save output results
        with open(output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": results}, f, indent=2)

        return results

def main():
    parser = argparse.ArgumentParser(description="Motion Intelligence & Optical Flow Engine")
    parser.add_argument("--video", required=True, help="Path to input MP4 video file")
    parser.add_argument("--output-json", required=True, help="Path to write optical flow results JSON")
    args = parser.parse_args()

    try:
        engine = MotionIntelligenceEngine()
        results = engine.process_video(args.video, args.output_json)
        
        # Compute peaks (motion density spikes)
        densities = [r["motion_density"] for r in results]
        peak_count = 0
        if densities:
            mean_dens = np.mean(densities)
            std_dens = np.std(densities)
            peak_count = sum(1 for d in densities if d > mean_dens + 1.5 * std_dens)

        print(json.dumps({
            "status": "success",
            "frames_processed": len(results) + 1,
            "motion_peaks_detected": peak_count,
            "output_file": args.output_json
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
