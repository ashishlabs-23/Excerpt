import sys
import unittest
import numpy as np

# Adjust path to import from scripts
sys.path.append("apps/api/scripts")
from tracking_service import KalmanFilter, STrack, bbox_iou, greedy_match, ByteTracker

class TestTrackingService(unittest.TestCase):
    def test_bbox_iou(self):
        box1 = [0.0, 0.0, 1.0, 1.0]
        box2 = [0.0, 0.0, 1.0, 1.0]
        self.assertAlmostEqual(bbox_iou(box1, box2), 1.0)

        box3 = [0.5, 0.5, 1.5, 1.5]
        # Intersect area: [0.5, 0.5, 1.0, 1.0] -> 0.25
        # Union area: 1.0 + 1.0 - 0.25 = 1.75
        self.assertAlmostEqual(bbox_iou(box1, box3), 0.25 / 1.75)

        box4 = [2.0, 2.0, 3.0, 3.0]
        self.assertEqual(bbox_iou(box1, box4), 0.0)

    def test_greedy_match(self):
        # Row 0 matches col 0 best (0.9)
        # Row 1 matches col 1 best (0.8)
        cost_matrix = np.array([
            [0.9, 0.1],
            [0.2, 0.8]
        ])
        matches, unmatched_tracks, unmatched_dets = greedy_match(cost_matrix, threshold=0.5)
        self.assertIn((0, 0), matches)
        self.assertIn((1, 1), matches)
        self.assertEqual(len(unmatched_tracks), 0)
        self.assertEqual(len(unmatched_dets), 0)

    def test_kalman_filter(self):
        kf = KalmanFilter()
        measurement = np.array([100.0, 100.0, 1.0, 50.0])
        mean, cov = kf.initiate(measurement)
        self.assertEqual(mean.shape, (8,))
        self.assertEqual(cov.shape, (8, 8))

        pred_mean, pred_cov = kf.predict(mean, cov)
        self.assertEqual(pred_mean.shape, (8,))
        self.assertEqual(pred_cov.shape, (8, 8))

    def test_byte_tracker_occlusion(self):
        tracker = ByteTracker(high_threshold=0.5, low_threshold=0.1, match_threshold=0.2)
        
        # Frame 1: Single object
        dets_f1 = [{"bbox": [10.0, 10.0, 20.0, 20.0], "confidence": 0.9}]
        tracks_f1 = tracker.update(dets_f1)
        self.assertEqual(len(tracks_f1), 1)
        orig_id = tracks_f1[0]["track_id"]

        # Frame 2: Object moves slightly, confidence drops (low threshold)
        dets_f2 = [{"bbox": [11.0, 11.0, 21.0, 21.0], "confidence": 0.4}]
        tracks_f2 = tracker.update(dets_f2)
        self.assertEqual(len(tracks_f2), 1)
        self.assertEqual(tracks_f2[0]["track_id"], orig_id)

        # Frame 3: Object becomes completely lost (no detections)
        tracks_f3 = tracker.update([])
        self.assertEqual(len(tracks_f3), 1)

        # Frame 4: Object reappears (high confidence)
        dets_f4 = [{"bbox": [12.0, 12.0, 22.0, 22.0], "confidence": 0.9}]
        tracks_f4 = tracker.update(dets_f4)
        self.assertEqual(len(tracks_f4), 1)
        # ID preservation through occlusion
        self.assertEqual(tracks_f4[0]["track_id"], orig_id)

if __name__ == "__main__":
    unittest.main()
