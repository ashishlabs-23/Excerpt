import os
import sys
import json
import argparse
import re

class CommentaryHypeEngine:
    def __init__(self):
        self.hype_keywords = ["GOAL", "UNBELIEVABLE", "WHAT A STRIKE", "HE'S DONE IT", "SENSATIONAL", "OH MY WORD", "INCREDIBLE", "BRILLIANT", "MAGIC"]

    def analyze_hype_timeline(self, segments):
        """
        Calculates a time-series momentum curve of commentary excitement.
        """
        timeline = []
        current_hype = 0.1 # Base level
        
        hype_climb_start = None
        hype_stabilize_end = None
        peak_hype = 0.0

        for segment in segments:
            text = segment.get("text", "").upper()
            start = segment.get("start", 0)
            end = segment.get("end", start + 2)
            
            # Simple keyword matching for excitement
            hits = sum(1 for kw in self.hype_keywords if kw in text)
            
            # Exclamation marks and all-caps density
            exclamations = text.count("!")
            caps_ratio = sum(1 for c in text if c.isupper()) / max(1, len(text.replace(" ", "")))
            
            # Calculate segment excitement
            segment_excitement = 0.1 + (hits * 0.3) + (exclamations * 0.15)
            if caps_ratio > 0.5:
                segment_excitement += 0.2
                
            # Smooth momentum curve
            current_hype = (current_hype * 0.4) + (segment_excitement * 0.6)
            current_hype = min(1.0, current_hype)
            
            timeline.append({
                "start": start,
                "end": end,
                "hype_score": round(current_hype, 4)
            })
            
            if current_hype > peak_hype:
                peak_hype = current_hype
                
            # Detect climb start
            if current_hype >= 0.4 and hype_climb_start is None:
                hype_climb_start = start
                
        # Detect stabilize post-peak
        if peak_hype > 0.6:
            post_peak_segments = [t for t in timeline if t["start"] > (hype_climb_start or 0)]
            for t in post_peak_segments:
                if t["hype_score"] < 0.4:
                    hype_stabilize_end = t["start"]
                    break
        
        if hype_stabilize_end is None and timeline:
            hype_stabilize_end = timeline[-1]["end"]

        return {
            "hype_score": round(peak_hype, 4),
            "high_excitement": peak_hype > 0.75,
            "hype_climb_start": hype_climb_start,
            "hype_stabilize_end": hype_stabilize_end,
            "timeline": timeline
        }

def main():
    parser = argparse.ArgumentParser(description="Commentary Audio Hype & Excitement Engine")
    parser.add_argument("--input-json", required=True, help="Payload JSON containing transcript_results")
    parser.add_argument("--output-json", required=True, help="Path to write hype evaluation results")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        segments = []
        if isinstance(data, dict) and "transcript_results" in data:
            if "segments" in data["transcript_results"]:
                segments = data["transcript_results"]["segments"]
                
        engine = CommentaryHypeEngine()
        result = engine.analyze_hype_timeline(segments)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "hype": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "hype": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
