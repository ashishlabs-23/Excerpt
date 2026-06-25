import sys
import json
import argparse
import math
from pathlib import Path

class LightGBMBoosterEmulator:
    """
    Upgraded LightGBM classification booster model.
    Evaluates virality using structural creator-centric features.
    """
    def __init__(self):
        # Boosting trees utilizing the 8 advanced virality features
        self.trees = [
            # Tree 0: Hook & Pacing Focus
            {
                "split_feature": "hook_pattern",
                "threshold": 0.70,
                "left": {
                    "split_feature": "speaking_speed",
                    "threshold": 130.0, # WPM too slow
                    "left": -1.5,
                    "right": -0.2
                },
                "right": {
                    "split_feature": "silence_percentage",
                    "threshold": 0.15, # Low silence/dead space is good
                    "left": 1.2,
                    "right": 0.3
                }
            },
            # Tree 1: Emotional & Visual Engagement
            {
                "split_feature": "emotion_level",
                "threshold": 0.60,
                "left": {
                    "split_feature": "sentiment_intensity",
                    "threshold": 0.50,
                    "left": -0.8,
                    "right": 0.1
                },
                "right": {
                    "split_feature": "face_visibility",
                    "threshold": 0.75, # High face time is critical for shorts
                    "left": 0.6,
                    "right": 1.5
                }
            },
            # Tree 2: Energy & Motion Pacing
            {
                "split_feature": "motion_intensity",
                "threshold": 0.50,
                "left": {
                    "split_feature": "keyword_strength",
                    "threshold": 0.60,
                    "left": -0.5,
                    "right": 0.4
                },
                "right": {
                    "split_feature": "speaking_speed",
                    "threshold": 160.0, # Upbeat speed
                    "left": 0.8,
                    "right": 1.6
                }
            }
        ]

    def _evaluate_node(self, node, features):
        if not isinstance(node, dict):
            return node
        
        feature_name = node["split_feature"]
        val = features.get(feature_name, 0.5)
        
        if val < node["threshold"]:
            return self._evaluate_node(node["left"], features)
        else:
            return self._evaluate_node(node["right"], features)

    def predict(self, features):
        raw_score = 0.0
        for tree in self.trees:
            raw_score += self._evaluate_node(tree, features)
            
        # Sigmoid calibration (0 to 100)
        prob = 1.0 / (1.0 + math.exp(-raw_score))
        return round(prob * 100.0, 2)

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No arguments provided"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
        segment_ids = input_data.get("segment_ids", [])
        
        # Load features per segment
        speaking_speeds = input_data.get("speaking_speeds", {})
        silence_percentages = input_data.get("silence_percentages", {})
        sentiment_intensities = input_data.get("sentiment_intensities", {})
        emotion_levels = input_data.get("emotion_levels", {})
        face_visibilities = input_data.get("face_visibilities", {})
        motion_intensities = input_data.get("motion_intensities", {})
        keyword_strengths = input_data.get("keyword_strengths", {})
        hook_patterns = input_data.get("hook_patterns", {})
        
        booster = LightGBMBoosterEmulator()
        results = []

        for seg_id in segment_ids:
            features = {
                "speaking_speed": speaking_speeds.get(seg_id, 140.0), # WPM
                "silence_percentage": silence_percentages.get(seg_id, 0.10),
                "sentiment_intensity": sentiment_intensities.get(seg_id, 0.60),
                "emotion_level": emotion_levels.get(seg_id, 0.50),
                "face_visibility": face_visibilities.get(seg_id, 0.70),
                "motion_intensity": motion_intensities.get(seg_id, 0.40),
                "keyword_strength": keyword_strengths.get(seg_id, 0.50),
                "hook_pattern": hook_patterns.get(seg_id, 0.65)
            }
            
            prediction = booster.predict(features)
            results.append({
                "id": seg_id,
                "score": prediction,
                "breakdown": {k: round(v, 2) for k, v in features.items()}
            })
            
        results.sort(key=lambda x: x["score"], reverse=True)
        top = results[0] if results else {"id": "none", "score": 0, "breakdown": {}}
        
        print(json.dumps({
            "status": "success",
            "top_segment_id": top["id"],
            "top_segment_score": top["score"],
            "score_breakdown": top["breakdown"],
            "results": results
        }))

    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
