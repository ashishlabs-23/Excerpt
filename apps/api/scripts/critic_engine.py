import os
import sys
import json
import argparse
import numpy as np

class CriticEngine:
    def __init__(self, threshold=70):
        self.threshold = threshold

    def evaluate_crop_and_tracking(self, crops, tracks):
        """
        Evaluates crop centering, subject containment, and coordinate jump anomalies.
        """
        crop_score = 100.0
        track_score = 100.0
        issues = []

        # Check frame-by-frame
        prev_coords = {}
        for idx, (c_data, t_data) in enumerate(zip(crops, tracks)):
            # Crop bounds
            cw, ch = c_data.get("w", 1.0), c_data.get("h", 1.0)
            cx, cy = c_data.get("x", 0.0), c_data.get("y", 0.0)
            
            # Subject tracks
            subjects = [t for t in t_data.get("tracks", []) if t.get("category") == "person"]
            
            # Verify if subject falls outside crop boundaries
            for sub in subjects:
                sb = sub["bbox"] # [x1, y1, x2, y2] normalized
                
                # Check if subject is clipped by crop borders
                if sb[0] < cx or sb[2] > (cx + cw) or sb[1] < cy or sb[3] > (cy + ch):
                    crop_score = max(0.0, crop_score - 10.0)
                    issue = "Subject clipped by reframing boundary"
                    if issue not in issues:
                        issues.append(issue)

                # Check track continuity jumps (more than 0.20 normalized screen distance)
                t_id = sub.get("track_id")
                sub_center = [(sb[0]+sb[2])/2.0, (sb[1]+sb[3])/2.0]
                if t_id in prev_coords:
                    dist = np.sqrt((sub_center[0] - prev_coords[t_id][0])**2 + (sub_center[1] - prev_coords[t_id][1])**2)
                    if dist > 0.20:
                        track_score = max(0.0, track_score - 15.0)
                        issue = "Choppy tracking or subject coordinate jumps detected"
                        if issue not in issues:
                            issues.append(issue)
                prev_coords[t_id] = sub_center

        return round(crop_score, 2), round(track_score, 2), issues

    def evaluate_captions(self, captions):
        """
        Evaluates caption readability, length, and styling layout.
        """
        score = 100.0
        issues = []

        for cap in captions:
            text = cap.get("text", "")
            words = text.split()
            # TikTok/Shorts best practices: Keep lines short (< 6 words)
            if len(words) > 6:
                score = max(0.0, score - 5.0)
                issue = "Caption line exceeds optimal word count limits"
                if issue not in issues:
                    issues.append(issue)
                    
            # Check for empty captions during speech segments
            if not text and cap.get("confidence", 1.0) > 0.8:
                score = max(0.0, score - 10.0)
                issue = "Missing caption overlay during speech active segments"
                if issue not in issues:
                    issues.append(issue)

        return round(score, 2), issues

    def evaluate_story_and_retention(self, story_arc, retention):
        """
        Checks narrative integrity (Setup -> Climax -> Payoff presence) and retention potentials.
        """
        story_score = 100.0
        issues = []

        stages = {item.get("stage") for item in story_arc}
        
        # Check climax presence
        if "Climax" not in stages:
            story_score = max(0.0, story_score - 40.0)
            issues.append("Clip lacks a narrative Climax phase")
            
        # Check payoff presence
        if "Payoff" not in stages:
            story_score = max(0.0, story_score - 20.0)
            issues.append("Clip ends abruptly without Payoff resolution")

        # Retention check
        ret_score = retention.get("completion_rate", 1.0) * 100.0
        if ret_score < 50.0:
            issues.append("Low predicted viewer retention rate")

        return round(story_score, 2), round(ret_score, 2), issues

    def evaluate_clip(self, evaluation_payload):
        """
        Combines crop, tracking, caption, story, and retention scores into a final grade.
        """
        crops = evaluation_payload.get("crops", [])
        tracks = evaluation_payload.get("tracks", [])
        captions = evaluation_payload.get("captions", [])
        story_arc = evaluation_payload.get("story_arc", [])
        retention = evaluation_payload.get("retention", {})
        emotions = evaluation_payload.get("emotions", [])

        # 1. Run evaluators
        crop_q, track_q, crop_track_issues = self.evaluate_crop_and_tracking(crops, tracks)
        cap_q, cap_issues = self.evaluate_captions(captions)
        story_q, ret_q, story_ret_issues = self.evaluate_story_and_retention(story_arc, retention)

        # 2. Emotion quality evaluation (Verify face tracked during peak emotion moments)
        emotion_q = 100.0
        emotion_issues = []
        for idx, emo in enumerate(emotions):
            if emo.get("confidence", 0.0) > 0.85:
                # Find corresponding frame tracks
                if idx < len(tracks):
                    f_tracks = tracks[idx].get("tracks", [])
                    has_face = any(t.get("category") == "person" for t in f_tracks)
                    if not has_face:
                        emotion_q = max(0.0, emotion_q - 10.0)
                        issue = "Missing facial target track during peak emotional climax"
                        if issue not in emotion_issues:
                            emotion_issues.append(issue)

        # 3. Aggregate final score (Weighted mean)
        # Weights: crop=0.20, track=0.20, caption=0.15, emotion=0.15, story=0.15, retention=0.15
        final_score = (
            0.20 * crop_q +
            0.20 * track_q +
            0.15 * cap_q +
            0.15 * emotion_q +
            0.15 * story_q +
            0.15 * ret_q
        )

        all_issues = crop_track_issues + cap_issues + story_ret_issues + emotion_issues
        score = int(round(final_score))
        regenerate = score < self.threshold

        return {
            "score": score,
            "regenerate": regenerate,
            "issues": all_issues,
            "breakdown": {
                "crop_quality": crop_q,
                "tracking_quality": track_q,
                "caption_quality": cap_q,
                "emotion_quality": emotion_q,
                "storytelling_quality": story_q,
                "retention_potential": ret_q
            }
        }

def main():
    parser = argparse.ArgumentParser(description="AI Clip Quality Critic Engine")
    parser.add_argument("--input-json", required=True, help="Path to evaluation payload JSON file")
    parser.add_argument("--output-json", required=True, help="Path to save critic evaluation results")
    parser.add_argument("--threshold", type=int, default=70, help="Regeneration score threshold")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            payload = json.load(f)
            
        engine = CriticEngine(threshold=args.threshold)
        results = engine.evaluate_clip(payload)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        print(json.dumps({
            "status": "success",
            "score": results["score"],
            "regenerate": results["regenerate"],
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
