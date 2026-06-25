import os
import sys
import json
import argparse
import numpy as np

class CrowdEmotionEngine:
    def __init__(self):
        pass

    def evaluate_crowd(self, audio_peaks):
        """
        Parses decibel volume spikes and pitch dynamics to calculate crowd excitement curves.
        """
        if not audio_peaks:
            return {"crowd_excitement": 0.5, "peak_found": False}

        avg_vol = np.mean(audio_peaks)
        peak_vol = np.max(audio_peaks)

        # High cheer threshold
        cheer_intensity = min(1.0, (peak_vol / 95.0)) # norm relative to 95dB

        return {
            "average_volume_db": round(float(avg_vol), 2),
            "peak_volume_db": round(float(peak_vol), 2),
            "crowd_excitement": round(float(cheer_intensity), 4),
            "peak_found": peak_vol > 80.0
        }

def main():
    parser = argparse.ArgumentParser(description="Crowd Noise Cheer Excitement Engine")
    parser.add_argument("--peaks-json", required=True, help="Path to audio decibel peaks JSON")
    parser.add_argument("--output-json", required=True, help="Path to write crowd metrics")
    args = parser.parse_args()

    try:
        with open(args.peaks_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        peaks = data.get("peaks", []) if isinstance(data, dict) else data
        engine = CrowdEmotionEngine()
        result = engine.evaluate_crowd(peaks)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "crowd": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "crowd": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
