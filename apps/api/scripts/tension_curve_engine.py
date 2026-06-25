import os
import sys
import json
import argparse
import numpy as np

class TensionCurveEngine:
    def __init__(self):
        pass

    def calculate_tension(self, time_remaining_sec, score_diff, commentary_energy, crowd_noise):
        # Time pressure factor (escalates towards end of half/game)
        # e.g., higher tension if time remaining is less than 300s (5 mins)
        time_factor = 1.0 - min(1.0, time_remaining_sec / 5400.0) # normalized to 90 mins

        # Parity factor (close scores increase tension)
        score_factor = 1.0 / (abs(score_diff) + 1.0)

        # Audio energy factor
        audio_factor = (commentary_energy + crowd_noise) / 2.0

        # Weighted calculation
        tension = (time_factor * 0.35) + (score_factor * 0.35) + (audio_factor * 0.30)
        tension_score = min(1.0, max(0.0, tension))

        return {
            "time_factor": round(time_factor, 4),
            "score_factor": round(score_factor, 4),
            "audio_factor": round(audio_factor, 4),
            "tension_score": round(tension_score, 4)
        }

def main():
    parser = argparse.ArgumentParser(description="Football Tension Curve Engine")
    parser.add_argument("--time-remaining", type=float, required=True, help="Remaining game time in seconds")
    parser.add_argument("--score-diff", type=int, required=True, help="Difference in score")
    parser.add_argument("--commentary", type=float, default=0.5, help="Commentary volume/energy [0-1]")
    parser.add_argument("--crowd", type=float, default=0.5, help="Crowd noise volume/energy [0-1]")
    parser.add_argument("--output-json", required=True, help="Path to write tension score")
    args = parser.parse_args()

    try:
        engine = TensionCurveEngine()
        result = engine.calculate_tension(args.time_remaining, args.score_diff, args.commentary, args.crowd)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "tension": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "tension": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
