import os
import sys
import json
import argparse
import numpy as np

class HumanAttentionEngine:
    def __init__(self, grid_size=10, weights=None, alpha=0.20, saccade_threshold=0.40):
        self.grid_size = grid_size
        self.alpha = alpha
        self.saccade_threshold = saccade_threshold
        
        # Saliency weights
        self.weights = weights or {
            "face": 0.40,
            "motion": 0.25,
            "semantic": 0.20,
            "bias": 0.15
        }
        
        # Semantic weights
        self.category_weights = {
            "person": 0.8,
            "sports ball": 1.0,
            "screen": 0.6,
            "whiteboard": 0.5,
            "phone": 0.4
        }

        # Temporal states
        self.prev_x = None
        self.prev_y = None

    def _gaussian_2d(self, cx, cy, sigma):
        """
        Generates a 2D Gaussian heatmap on the grid centered at (cx, cy).
        """
        x = np.linspace(0.0, 1.0, self.grid_size)
        y = np.linspace(0.0, 1.0, self.grid_size)
        xx, yy = np.meshgrid(x, y)
        
        # Gaussian formula
        sigma_sq = max(0.001, sigma ** 2)
        kernel = np.exp(-((xx - cx)**2 + (yy - cy)**2) / (2.0 * sigma_sq))
        return kernel

    def calculate_attention(self, tracks):
        """
        Builds a normalized 2D attention heatmap combining multimodal visual cues.
        """
        # Initialize sub-maps
        face_map = np.zeros((self.grid_size, self.grid_size))
        motion_map = np.zeros((self.grid_size, self.grid_size))
        semantic_map = np.zeros((self.grid_size, self.grid_size))
        
        # 1. Center Bias Map (modeling natural human visual tendency)
        bias_map = self._gaussian_2d(0.5, 0.5, sigma=0.35)

        face_count = 0
        motion_count = 0
        semantic_count = 0

        for t in tracks:
            bbox = t["bbox"]
            c_x = (bbox[0] + bbox[2]) / 2.0
            c_y = (bbox[1] + bbox[3]) / 2.0
            
            category = t.get("category", "person")
            vel = t.get("velocity", [0.0, 0.0])
            conf = t.get("confidence", 1.0)

            # 2. Face Saliency
            if category == "face":
                area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
                sigma = max(0.05, np.sqrt(area) * 0.5)
                face_map += self._gaussian_2d(c_x, c_y, sigma=sigma) * conf
                face_count += 1
                
            # 3. Motion Saliency
            vel_mag = np.sqrt(vel[0]**2 + vel[1]**2)
            if vel_mag > 0.005:
                # Higher velocity increases attention focus size and intensity
                sigma = min(0.20, 0.08 + vel_mag * 2.0)
                motion_map += self._gaussian_2d(c_x, c_y, sigma=sigma) * min(1.0, vel_mag * 15.0)
                motion_count += 1

            # 4. Semantic Saliency
            cat_weight = self.category_weights.get(category, 0.3)
            semantic_map += self._gaussian_2d(c_x, c_y, sigma=0.15) * cat_weight * conf
            semantic_count += 1

        # Normalize individual sub-maps if populated
        if face_count > 0: face_map /= face_count
        if motion_count > 0: motion_map /= motion_count
        if semantic_count > 0: semantic_map /= semantic_count

        # Fused Attention Heatmap
        attention_grid = (
            self.weights["face"] * face_map +
            self.weights["motion"] * motion_map +
            self.weights["semantic"] * semantic_map +
            self.weights["bias"] * bias_map
        )
        
        # Max-normalize the final heatmap so values lie in range [0, 1]
        max_val = np.max(attention_grid)
        if max_val > 0:
            attention_grid /= max_val

        # 5. Extract Focus Centroids (Max Pooling)
        # Find global maximum cell (Primary Focus)
        p_idx = np.unravel_index(np.argmax(attention_grid), attention_grid.shape)
        p_x = float(p_idx[1] / (self.grid_size - 1))
        p_y = float(p_idx[0] / (self.grid_size - 1))
        p_score = float(attention_grid[p_idx])

        # Find local maximum cell not adjacent to primary (Secondary Focus)
        s_x, s_y, s_score = 0.5, 0.5, 0.0
        best_val = -1.0
        
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                # Ensure cell is not within 2-grid distance of primary focus
                if abs(r - p_idx[0]) <= 2 and abs(c - p_idx[1]) <= 2:
                    continue
                if attention_grid[r, c] > best_val:
                    best_val = attention_grid[r, c]
                    s_x = float(c / (self.grid_size - 1))
                    s_y = float(r / (self.grid_size - 1))
                    s_score = float(best_val)

        # 6. Apply Temporal Gaze Smoothing (stabilization)
        if self.prev_x is None:
            smooth_x, smooth_y = p_x, p_y
        else:
            # Check for Saccade snaps (large focus jumps)
            dist = np.sqrt((p_x - self.prev_x)**2 + (p_y - self.prev_y)**2)
            if dist > self.saccade_threshold:
                # Snap gaze instantly to prevent pans
                smooth_x, smooth_y = p_x, p_y
            else:
                # Smooth gaze placement
                smooth_x = self.alpha * p_x + (1.0 - self.alpha) * self.prev_x
                smooth_y = self.alpha * p_y + (1.0 - self.alpha) * self.prev_y

        self.prev_x = smooth_x
        self.prev_y = smooth_y

        return {
            "attention_heatmap": [[round(val, 3) for val in row] for row in attention_grid.tolist()],
            "primary_focus": {
                "x": round(smooth_x, 3),
                "y": round(smooth_y, 3),
                "score": round(p_score, 3)
            },
            "secondary_focus": {
                "x": round(s_x, 3),
                "y": round(s_y, 3),
                "score": round(s_score, 3)
            }
        }

def main():
    parser = argparse.ArgumentParser(description="Human Visual Attention Prediction Engine")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write predicted attention logs")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        
        engine = HumanAttentionEngine()
        output_results = []

        for entry in frames_tracks:
            frame_name = entry.get("frame")
            tracks = entry.get("tracks", [])
            
            attention_results = engine.calculate_attention(tracks)
            
            output_results.append({
                "frame": frame_name,
                "attention": attention_results
            })

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": output_results}, f, indent=2)

        print(json.dumps({
            "status": "success",
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
