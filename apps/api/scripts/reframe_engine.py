import os
import sys
import json
import argparse
import numpy as np

class SmartReframeEngine:
    def __init__(self, width=1920, height=1080, alpha=0.15, dead_zone=0.05, scene_threshold=0.35):
        self.W = width
        self.H = height
        self.alpha = alpha
        self.dead_zone_px = width * dead_zone
        self.scene_threshold_px = width * scene_threshold
        
        # Keep track of previous smoothed state
        self.prev_cx = None
        self.prev_cy = None
        self.prev_cw = None
        self.prev_ch = None

    def calculate_crop(self, priorities):
        """
        Calculates the crop coordinates for a frame based on subject priorities.
        """
        # 1. Fallback if no subjects are detected: Center crop
        if not priorities:
            target_ch = self.H
            target_cw = target_ch * (9.0 / 16.0)
            target_cx = self.W / 2.0
            target_cy = self.H / 2.0
            return self._apply_smoothing(target_cx, target_cy, target_cw, target_ch, force_snap=False)

        # 2. Select key tracks: active speakers and high-priority contextual objects.
        # We find the maximum score first.
        max_score = priorities[0]["priority_score"]
        
        # Include tracks within 15% of the highest score OR contextual objects (screen, whiteboard, laptop, phone) that have boosted priorities.
        # Boosted categories are: screen, whiteboard, laptop, phone
        context_categories = {"screen", "whiteboard", "laptop", "phone"}
        key_tracks = []
        for t in priorities:
            is_key_by_score = (max_score - t["priority_score"] <= 0.15)
            is_context_object = (t.get("category") in context_categories and t["priority_score"] >= 0.45)
            if is_key_by_score or is_context_object:
                key_tracks.append(t)
                
        if not key_tracks:
            key_tracks = [priorities[0]]

        # 3. Compute union bounding box of key tracks (converting normalized boxes to pixels)
        min_x, min_y = self.W, self.H
        max_x, max_y = 0.0, 0.0
        
        for t in key_tracks:
            # bbox format: [x1, y1, x2, y2] normalized
            bbox = t["bbox"]
            px1, py1 = bbox[0] * self.W, bbox[1] * self.H
            px2, py2 = bbox[2] * self.W, bbox[3] * self.H
            
            min_x = min(min_x, px1)
            min_y = min(min_y, py1)
            max_x = max(max_x, px2)
            max_y = max(max_y, py2)

        # Enclosure dimensions
        enc_w = max_x - min_x
        enc_h = max_y - min_y
        
        # 4. Adaptive Zoom with 20% padding margin
        margin = 1.20
        target_cw = enc_w * margin
        target_ch = enc_h * margin
        
        # Strict 9:16 aspect ratio fitting
        if target_cw / (target_ch if target_ch > 0 else 0.001) > (9.0 / 16.0):
            # Width is the constraint
            target_cw = max(target_cw, 100.0)
            target_ch = target_cw * (16.0 / 9.0)
        else:
            # Height is the constraint
            target_ch = max(target_ch, 100.0)
            target_cw = target_ch * (9.0 / 16.0)

        # Keep zoom boundaries within limits (max zoom = 40% height, min zoom = 100% height)
        target_ch = np.clip(target_ch, self.H * 0.40, self.H)
        target_cw = target_ch * (9.0 / 16.0)

        # Target center
        target_cx = (min_x + max_x) / 2.0
        target_cy = (min_y + max_y) / 2.0
        
        return self._apply_smoothing(target_cx, target_cy, target_cw, target_ch, force_snap=False)

    def _apply_smoothing(self, target_cx, target_cy, target_cw, target_ch, force_snap=False):
        """
        Applies Exponential Moving Average (EMA) with dead zone and scene cut snapping.
        """
        if self.prev_cx is None or force_snap:
            # First frame or forced snap (e.g. scene cut)
            cx, cy, cw, ch = target_cx, target_cy, target_cw, target_ch
        else:
            # Calculate distance from target center to previous center
            dist = np.sqrt((target_cx - self.prev_cx)**2 + (target_cy - self.prev_cy)**2)
            
            # 1. Scene Cut Snapping
            if dist > self.scene_threshold_px:
                cx, cy, cw, ch = target_cx, target_cy, target_cw, target_ch
            else:
                # 2. Dead Zone Check
                if dist < self.dead_zone_px:
                    cx = self.prev_cx
                    cy = self.prev_cy
                else:
                    # Smooth center coordinates
                    cx = self.alpha * target_cx + (1.0 - self.alpha) * self.prev_cx
                    cy = self.alpha * target_cy + (1.0 - self.alpha) * self.prev_cy
                
                # Smooth crop size (zoom)
                ch = self.alpha * target_ch + (1.0 - self.alpha) * self.prev_ch
                cw = ch * (9.0 / 16.0)

        # 5. Bounding Box Clamping (ensure crop fits entirely inside source video)
        half_w = cw / 2.0
        half_h = ch / 2.0
        
        # Clamp horizontally
        if cx - half_w < 0:
            cx = half_w
        elif cx + half_w > self.W:
            cx = self.W - half_w
            
        # Clamp vertically
        if cy - half_h < 0:
            cy = half_h
        elif cy + half_h > self.H:
            cy = self.H - half_h

        # Update tracking history
        self.prev_cx = cx
        self.prev_cy = cy
        self.prev_cw = cw
        self.prev_ch = ch

        # Convert to integer pixel coordinates for FFmpeg filter
        crop_w = int(round(cw))
        crop_h = int(round(ch))
        crop_x = int(round(cx - half_w))
        crop_y = int(round(cy - half_h))

        return {
            "cx": round(cx, 2),
            "cy": round(cy, 2),
            "w": crop_w,
            "h": crop_h,
            "x": crop_x,
            "y": crop_y,
            "ffmpeg_filter": f"crop={crop_w}:{crop_h}:{crop_x}:{crop_y}"
        }

def main():
    parser = argparse.ArgumentParser(description="Smart 9:16 Video Reframe Engine")
    parser.add_argument("--priority-json", required=True, help="Path to JSON file containing frame priorities")
    parser.add_argument("--output-json", required=True, help="Path to write reframed crop coordinates")
    parser.add_argument("--width", type=int, default=1920, help="Source video width")
    parser.add_argument("--height", type=int, default=1080, help="Source video height")
    parser.add_argument("--alpha", type=float, default=0.15, help="Camera smoothing factor (EMA)")
    parser.add_argument("--dead-zone", type=float, default=0.05, help="Dead zone fraction of width")
    parser.add_argument("--scene-threshold", type=float, default=0.35, help="Scene cut snap threshold fraction")
    args = parser.parse_args()

    try:
        with open(args.priority_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_priorities = data.get("results", []) if isinstance(data, dict) else data
        
        engine = SmartReframeEngine(
            width=args.width,
            height=args.height,
            alpha=args.alpha,
            dead_zone=args.dead_zone,
            scene_threshold=args.scene_threshold
        )
        
        output_crops = []
        for entry in frames_priorities:
            frame_name = entry.get("frame")
            priorities = entry.get("priorities", [])
            
            crop_coords = engine.calculate_crop(priorities)
            output_crops.append({
                "frame": frame_name,
                "crop": crop_coords
            })

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": output_crops}, f, indent=2)

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
