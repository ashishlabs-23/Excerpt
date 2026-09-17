import os
import sys
import json
import argparse
import numpy as np

class StoryArcEngine:
    def __init__(self):
        # Weights for intensity calculation
        self.w_speech = 0.25
        self.w_motion = 0.25
        self.w_emotion = 0.30
        self.w_event = 0.20
        
        # Storytelling keywords (hooks)
        self.hook_words = {"suddenly", "incredible", "unbelievable", "amazing", "watch", "look", "oh", "wow", "here", "goes", "shoot", "goal"}

    def calculate_intensity(self, segment):
        """
        Computes the narrative intensity score I(t) for a given segment.
        """
        # 1. Speech Pacing & Hook Words
        speech_score = 0.0
        transcript = segment.get("transcript", "")
        if transcript:
            # Word count as a proxy for pace
            words = transcript.lower().split()
            # Normalize: 3 words/sec is ~1.0
            pacing = len(words) / max(1.0, segment.get("duration", 1.0))
            speech_score = min(1.0, pacing / 3.0)
            
            # Check for hook words
            hooks = [w for w in words if w in self.hook_words]
            if hooks:
                speech_score = min(1.0, speech_score + 0.3)

        # 2. Motion Intensity
        motion = segment.get("motion", {})
        motion_score = min(1.0, motion.get("magnitude", 0.0) * 10.0 + motion.get("density", 0.0))

        # 3. Emotion Intensity (Peak surprise, joy, laughter, arousal)
        emotion = segment.get("emotion", {})
        emotion_vals = [
            emotion.get("surprise", 0.0),
            emotion.get("laughter", 0.0),
            emotion.get("joy", 0.0),
            emotion.get("arousal", 0.0)
        ]
        emotion_score = max(emotion_vals) if emotion_vals else 0.0

        # 4. Event Climax Signal
        event_score = 0.0
        events = segment.get("events", [])
        major_events = {"goal", "dunk", "three_pointer", "shot", "steal", "save"}
        mid_events = {"pass", "cross", "dribble", "celebration", "crowd_reaction"}
        
        if any(e in major_events for e in events):
            event_score = 1.0
        elif any(e in mid_events for e in events):
            event_score = 0.5

        # Combined weighted score
        intensity = (
            self.w_speech * speech_score +
            self.w_motion * motion_score +
            self.w_emotion * emotion_score +
            self.w_event * event_score
        )
        return round(float(intensity), 4)

    def analyze_timeline(self, segments):
        """
        Classifies timeline segments into Setup, Build-up, Tension, Climax, Payoff, and calculates arc score.
        """
        if not segments:
            return {"story_arc": [], "arc_score": 0.0, "optimized_clips": []}

        # Step 1: Calculate intensities for all segments
        intensities = [self.calculate_intensity(s) for s in segments]
        
        # Step 2: Identify the peak intensity (Climax candidates)
        max_idx = int(np.argmax(intensities))
        
        # Step 3: Classify each segment into narrative stages
        story_arc = []
        for idx, seg in enumerate(segments):
            intensity = intensities[idx]
            timestamp = seg.get("timestamp", 0.0)
            
            # Simple heuristic sequence relative to the climax peak
            if idx < max_idx:
                # Prior to climax: Setup or Build-up or Tension
                if idx < max_idx * 0.4:
                    stage = "Setup"
                    desc = "Setting the scene and introducing context."
                elif idx < max_idx * 0.8:
                    stage = "Build-up"
                    desc = "Action rising, pace increasing."
                else:
                    stage = "Tension"
                    desc = "High suspense or peak build-up before the moment."
            elif idx == max_idx:
                stage = "Climax"
                desc = "The peak action, event, or payoff of the sequence."
            else:
                # Post climax: Payoff
                stage = "Payoff"
                desc = "Resolution, reactions, and celebration."

            story_arc.append({
                "timestamp": timestamp,
                "intensity": intensity,
                "stage": stage,
                "description": desc,
                "events": seg.get("events", []),
                "transcript": seg.get("transcript", "")
            })

        # Step 4: Calculate Arc Score (degree of adherence to complete storytelling structure)
        stages_present = {item["stage"] for item in story_arc}
        # A good story arc should have at least 4 of the 5 stages including Climax and Payoff
        arc_score = len(stages_present) / 5.0
        
        # Boost if climax intensity is high
        if intensities:
            arc_score = min(1.0, arc_score * 0.7 + max(intensities) * 0.3)

        # Step 5: Clip Boundary Optimization
        # Find clip window that includes the build-up/tension, the climax, and the payoff resolution
        optimized_clips = []
        if len(segments) > 2:
            climax_idx = max_idx
            
            # Start clip at the start of Build-up (or Setup if short)
            start_idx = 0
            for idx, item in enumerate(story_arc):
                if item["stage"] in ["Build-up", "Tension"]:
                    start_idx = idx
                    break
            
            # End clip after Payoff decays or video ends
            end_idx = len(segments) - 1
            for idx in range(climax_idx + 1, len(segments)):
                if story_arc[idx]["intensity"] < 0.25:
                    end_idx = idx
                    break
            
            start_time = segments[start_idx].get("timestamp", 0.0)
            # End time includes the duration of the final segment
            last_seg = segments[end_idx]
            end_time = last_seg.get("timestamp", 0.0) + last_seg.get("duration", 1.0)
            
            optimized_clips.append({
                "start_time": round(float(start_time), 2),
                "end_time": round(float(end_time), 2),
                "score": round(float(arc_score), 4)
            })

        return {
            "story_arc": story_arc,
            "arc_score": round(float(arc_score), 4),
            "optimized_clips": optimized_clips
        }

def main():
    parser = argparse.ArgumentParser(description="Narrative Story Arc Engine")
    parser.add_argument("--input-json", required=True, help="Path to input segments JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write story arc analysis JSON")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        segments = data.get("results", []) if isinstance(data, dict) else data
        
        engine = StoryArcEngine()
        results = engine.analyze_timeline(segments)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "results": results}, f, indent=2)

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
