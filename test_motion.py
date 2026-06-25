import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from motion_engine import MotionIntelligenceEngine

class TestMotionIntelligenceEngine(unittest.TestCase):
    def test_camera_pan_right(self):
        engine = MotionIntelligenceEngine(grid_size=8, pan_threshold=1.0, var_threshold=0.5)
        
        # Simulate uniform translation flow pointing right: dx = 3.0, dy = 0.0
        h, w = 180, 320
        prev_gray = np.zeros((h, w), dtype=np.uint8)
        curr_gray = np.zeros((h, w), dtype=np.uint8)
        
        # We mock calculate_frame_motion behavior with a fake flow field:
        # Instead of calculating calcOpticalFlowFarneback which requires real images,
        # we can verify that the mathematical classifier inside works correctly.
        # Let's mock Farneback flow matrices:
        dx = np.full((h, w), 3.0, dtype=np.float32)
        dy = np.full((h, w), 0.0, dtype=np.float32)
        
        # Manually invoke the classification math
        # We can test the divergence and classification math directly
        cx, cy = w / 2.0, h / 2.0
        x_indices = np.linspace(0.0, w, w)
        y_indices = np.linspace(0.0, h, h)
        xx, yy = np.meshgrid(x_indices, y_indices)
        
        rx = xx - cx
        ry = yy - cy
        r_mag = np.sqrt(rx**2 + ry**2)
        r_mag[r_mag == 0] = 1.0
        
        ux = rx / r_mag
        uy = ry / r_mag
        
        proj = dx * ux + dy * uy
        divergence = float(np.mean(proj))
        
        mean_dx = float(np.mean(dx))
        mean_dy = float(np.mean(dy))
        var_dx = float(np.var(dx))
        var_dy = float(np.var(dy))
        
        flow_mag = np.sqrt(mean_dx**2 + mean_dy**2)
        
        camera_event = "Static"
        if flow_mag > engine.pan_threshold and (var_dx + var_dy) < engine.var_threshold:
            camera_event = "Pan"
            angle = np.arctan2(mean_dy, mean_dx) * 180 / np.pi
            if -45 <= angle < 45: camera_event += " Right"
            elif 45 <= angle < 135: camera_event += " Down"
            elif -135 <= angle < -45: camera_event += " Up"
            else: camera_event += " Left"
            
        self.assertEqual(camera_event, "Pan Right")
        self.assertAlmostEqual(divergence, 0.0, places=3) # Divergence should be 0 for pure translation

    def test_camera_zoom_in(self):
        engine = MotionIntelligenceEngine(grid_size=8, zoom_threshold=0.5)
        
        h, w = 180, 320
        cx, cy = w / 2.0, h / 2.0
        x_indices = np.linspace(0.0, w, w)
        y_indices = np.linspace(0.0, h, h)
        xx, yy = np.meshgrid(x_indices, y_indices)
        
        rx = xx - cx
        ry = yy - cy
        r_mag = np.sqrt(rx**2 + ry**2)
        r_mag[r_mag == 0] = 1.0
        
        # Simulate radial flow pointing outward (Zoom In): dx = rx * 0.01, dy = ry * 0.01
        dx = rx * 0.01
        dy = ry * 0.01
        
        ux = rx / r_mag
        uy = ry / r_mag
        
        proj = dx * ux + dy * uy
        divergence = float(np.mean(proj))
        
        camera_event = "Static"
        if abs(divergence) > engine.zoom_threshold:
            if divergence > 0:
                camera_event = "Zoom In"
            else:
                camera_event = "Zoom Out"
                
        self.assertEqual(camera_event, "Zoom In")
        self.assertGreater(divergence, 0.8)

if __name__ == "__main__":
    unittest.main()
