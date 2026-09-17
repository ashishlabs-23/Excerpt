import os
import sys
import json
import argparse

class BallVisibilityCritic:
    def __init__(self):
        pass

    def evaluate_clip(self, frames_tracks):
        total_frames = len(frames_tracks)
        if total_frames == 0:
            return {"ball_visibility": 0.0, "penalty": True, "score_deduction": 20}

        visible_frames = 0
        for entry in frames_tracks:
            tracks = entry.get("tracks", [])
            has_ball = any(t.get("category") == "sports ball" for t in tracks)
            if has_ball:
                visible_frames += 1

        visibility_ratio = visible_frames / total_frames
        penalty = visibility_ratio < 0.80
        score_deduction = 20 if penalty else 0

        return {
            "total_frames": total_frames,
            "visible_frames": visible_frames,
            "ball_visibility": round(visibility_ratio, 4),
            "penalty": penalty,
            "score_deduction": score_deduction
        }

def main():
    parser = argparse.ArgumentParser(description="Football Ball Visibility Critic")
    parser.add_argument("--tracks-json", required=True, help="Path to tracking output JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write evaluation results")
    args = parser.parse_args()

    try:
        with open(args.tracks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        frames_tracks = data.get("results", []) if isinstance(data, dict) else data
        critic = BallVisibilityCritic()
        result = critic.evaluate_clip(frames_tracks)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "metrics": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "metrics": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
