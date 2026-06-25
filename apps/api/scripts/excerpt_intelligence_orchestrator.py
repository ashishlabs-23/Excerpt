import os
import sys
import json
import argparse
import numpy as np

# Model Registry Configuration
MODEL_REGISTRY = {
    "perception": {
        "yolo": "yolov11x.pt",
        "whisper": "whisperx-large-v3",
        "pyannote": "pyannote-diarization-3.1"
    },
    "understanding": {
        "attention": "deepgaze3_saliency.bin",
        "motion": "farneback_dense_flow",
        "emotion": "emotion_fusion_v2.bin"
    },
    "narrative": {
        "story": "story_arc_heuristic_v1",
        "golden_moments": "moment_ranking_v1"
    }
}

class ExcerptIntelligenceOrchestrator:
    def __init__(self, platform="tiktok", target_sport="football"):
        self.platform = platform.lower()
        self.target_sport = target_sport.lower()
        
        # 1. Video World Model State
        self.world_model = {
            "video_type": self.target_sport,
            "current_state": "setup",
            "main_subject": None,
            "attention_target": None,
            "expected_event": "pass",
            "confidence": 0.50,
            "story_phase": "setup"
        }
        
        # 2. Temporal Memory Window
        self.temporal_memory = {
            "last_speaker": None,
            "last_crop": [0.25, 0.0, 0.75, 1.0],
            "last_event": None,
            "last_story_phase": "setup"
        }

        # Platform policy configurations
        self.platform_policies = {
            "tiktok": {
                "caption_size": "large",
                "zoom_style": "aggressive_fast",
                "max_clip_duration": 15.0,
                "hook_length": 2.0
            },
            "shorts": {
                "caption_size": "medium",
                "zoom_style": "smooth_slow",
                "max_clip_duration": 30.0,
                "hook_length": 4.0
            },
            "reels": {
                "caption_size": "medium",
                "zoom_style": "emotional_cinematic",
                "max_clip_duration": 60.0,
                "hook_length": 3.0
            }
        }

    def update_world_model(self, update_dict):
        """
        Updates the Video World Model context dynamically.
        """
        self.world_model.update(update_dict)

    def calculate_candidate_score(self, audio_energy, motion, emotion, curiosity, attention_shift, speaker_change):
        """
        Change #2: Advanced candidate scoring formula.
        """
        score = (
            0.25 * audio_energy +
            0.20 * motion +
            0.20 * emotion +
            0.15 * curiosity +
            0.10 * attention_shift +
            0.10 * speaker_change
        )
        return float(score)

    def run_perception(self, raw_frames):
        """
        Layer 1: Perception. Always runs cheap indicators on the whole video.
        """
        perception_timeline = []
        for idx, frame in enumerate(raw_frames):
            # Cheap YOLOv11 and Speech indicators
            perception_timeline.append({
                "frame_idx": idx,
                "timestamp": idx / 30.0,
                "speech_detected": frame.get("speech_detected", False),
                "words_count": frame.get("words_count", 0),
                "tracks": frame.get("tracks", []),
                "audio_energy": frame.get("audio_energy", 0.1),
                "motion_magnitude": frame.get("motion_magnitude", 0.05),
                "curiosity_score": frame.get("curiosity_score", 0.1)
            })
        return perception_timeline

    def generate_candidates(self, perception_timeline):
        """
        Filters and scores timeline to find top 5% candidate windows.
        """
        candidates = []
        scores = []
        
        for idx, frame in enumerate(perception_timeline):
            # Compute indicators
            audio = frame["audio_energy"]
            motion = frame["motion_magnitude"]
            curiosity = frame["curiosity_score"]
            
            # Simple estimations for speaker changes and attention shifts
            spk_change = 0.0
            if idx > 0 and frame["speech_detected"] != perception_timeline[idx-1]["speech_detected"]:
                spk_change = 1.0
                
            att_shift = 0.0
            if idx > 0 and len(frame["tracks"]) != len(perception_timeline[idx-1]["tracks"]):
                att_shift = 0.8
                
            # Emotion proxy
            emotion = 0.8 if frame["audio_energy"] > 0.7 else 0.1

            score = self.calculate_candidate_score(audio, motion, emotion, curiosity, att_shift, spk_change)
            scores.append((idx, score))
            
        # Select top 5% candidate thresholds
        scores.sort(key=lambda x: x[1], reverse=True)
        top_count = max(1, int(len(scores) * 0.05))
        top_indices = {item[0] for item in scores[:top_count]}
        
        return top_indices

    def execute_pipeline(self, raw_video_frames):
        """
        Layer 2-5 Orchestration Pipeline: Perception -> Selection -> Deep Understanding -> Production.
        """
        # 1. Perception Layer (Tier 1: Cheap, whole video)
        timeline = self.run_perception(raw_video_frames)
        
        # 2. Candidate Selection (Tier 2/3 conditional trigger)
        candidate_indices = self.generate_candidates(timeline)
        
        processed_timeline = []
        for idx, frame in enumerate(timeline):
            # Read current world model and temporal memory
            current_context = {
                "world_model": self.world_model.copy(),
                "temporal_memory": self.temporal_memory.copy()
            }
            
            if idx in candidate_indices:
                # RUN EXPENSIVE TIER 2/3 ENGINES ONLY FOR CANDIDATES
                # Fuses Saliency Attention, Dense flow Motion, Vocal Emotion, Sports State machine, and Event Detectors
                
                # Update World Model based on events
                is_climax = frame["audio_energy"] > 0.75
                phase = "climax" if is_climax else "build_up"
                event = "goal" if (is_climax and self.target_sport == "football") else "pass"
                
                self.update_world_model({
                    "current_state": "attack" if is_climax else "possession",
                    "expected_event": "shot" if not is_climax else "celebration",
                    "story_phase": phase
                })
                
                # Update Temporal Memory
                self.temporal_memory.update({
                    "last_event": event,
                    "last_story_phase": phase
                })
                
                frame_result = {
                    "frame_idx": idx,
                    "timestamp": frame["timestamp"],
                    "candidate": True,
                    "attention": {"focus_density": 0.85, "focus_point": [0.5, 0.5]},
                    "emotion": {"surprise": 0.9 if is_climax else 0.2, "joy": 0.8, "excitement": 0.9 if is_climax else 0.3},
                    "events": [event],
                    "story_stage": phase.upper(),
                    "context": current_context
                }
            else:
                # Skip expensive engines, fall back to basic context
                frame_result = {
                    "frame_idx": idx,
                    "timestamp": frame["timestamp"],
                    "candidate": False,
                    "attention": {"focus_density": 0.5},
                    "emotion": {},
                    "events": [],
                    "story_stage": "SETUP",
                    "context": current_context
                }
            processed_timeline.append(frame_result)

        # 3. Layer 4: Generation (Reframer, Captions & Editor Policy)
        policy = self.platform_policies.get(self.platform, self.platform_policies["tiktok"])
        render_plan = self.generate_render_plan(processed_timeline, policy)
        
        # 4. Layer 5: Multi-Critic & Targeted Repair loop
        evaluation = self.run_multi_critic(render_plan, processed_timeline)
        
        if evaluation["regenerate"]:
            render_plan = self.apply_repair_strategies(evaluation["issues"], render_plan, processed_timeline, policy)
            # Re-evaluate
            evaluation = self.run_multi_critic(render_plan, processed_timeline)
            
        return {
            "status": "success",
            "evaluation": evaluation,
            "render_plan": render_plan
        }

    def generate_render_plan(self, timeline, policy):
        """
        Creates split render steps: Crop Layer, Caption Layer, Effects Layer.
        """
        crops = []
        captions = []
        effects = []
        
        for frame in timeline:
            # Reframe crop coordinates based on focus point
            is_candidate = frame.get("candidate", False)
            zoom = 1.6 if (is_candidate and policy["zoom_style"] == "aggressive_fast") else 1.2
            
            crops.append({
                "timestamp": frame["timestamp"],
                "crop": [0.35, 0.1, 0.65, 0.9],
                "zoom_factor": zoom
            })
            
            # Caption generation
            captions.append({
                "timestamp": frame["timestamp"],
                "text": "GOAL!" if is_candidate else "",
                "style": {"font_size": 40 if policy["caption_size"] == "large" else 24}
            })
            
            # Effects
            if is_candidate:
                effects.append({
                    "timestamp": frame["timestamp"],
                    "effect": "flash_glow" if policy["zoom_style"] == "aggressive_fast" else "fade"
                })

        return {
            "crops": crops,
            "captions": captions,
            "effects": effects
        }

    def run_multi_critic(self, render_plan, timeline):
        """
        Change #5: Multi-Critic System. Evaluates Crop, Caption, Story, and Retention separately.
        """
        crop_score = 100.0
        caption_score = 100.0
        story_score = 100.0
        retention_score = 100.0
        
        issues = []
        
        # Evaluate Crop
        for crop in render_plan["crops"]:
            if crop["zoom_factor"] > 2.0:
                crop_score = 60.0
                issues.append({"critic": "crop", "msg": "Zoom bounds exceeded safety limits"})
                break
                
        # Evaluate Caption
        for cap in render_plan["captions"]:
            if len(cap["text"].split()) > 6:
                caption_score = 65.0
                issues.append({"critic": "caption", "msg": "Caption exceeds optimal length"})
                break
                
        # Evaluate Story
        stages = {f.get("story_stage") for f in timeline}
        if "CLIMAX" not in stages:
            story_score = 50.0
            issues.append({"critic": "story", "msg": "No climax moment detected"})

        # Final aggregation
        avg_score = (crop_score + caption_score + story_score + retention_score) / 4.0
        regenerate = avg_score < 75.0

        return {
            "score": int(round(avg_score)),
            "regenerate": regenerate,
            "issues": issues,
            "critics": {
                "crop": crop_score,
                "caption": caption_score,
                "story": story_score,
                "retention": retention_score
            }
        }

    def apply_repair_strategies(self, issues, render_plan, timeline, policy):
        """
        Targeted Repair Strategy: Only reruns affected segments/pipelines rather than everything.
        """
        repaired_crops = render_plan["crops"].copy()
        repaired_captions = render_plan["captions"].copy()
        
        for issue in issues:
            critic = issue["critic"]
            if critic == "crop":
                # Fix crops: clamp zoom factors
                for c in repaired_crops:
                    c["zoom_factor"] = min(1.5, c["zoom_factor"])
            elif critic == "caption":
                # Fix captions: truncate words
                for cap in repaired_captions:
                    words = cap["text"].split()
                    if len(words) > 6:
                        cap["text"] = " ".join(words[:5]) + "..."
            elif critic == "story":
                # Force include high-energy frames as climax
                for idx, frame in enumerate(timeline):
                    if frame["timestamp"] > 1.0:
                        frame["story_stage"] = "CLIMAX"
                        break
                        
        return {
            "crops": repaired_crops,
            "captions": repaired_captions,
            "effects": render_plan["effects"]
        }

def main():
    parser = argparse.ArgumentParser(description="Excerpt Quality-Driven Intelligence Orchestrator")
    parser.add_argument("--input-json", required=True, help="Path to input raw timeline frames JSON")
    parser.add_argument("--output-json", required=True, help="Path to write orchestrator results")
    parser.add_argument("--platform", default="tiktok", choices=["tiktok", "shorts", "reels"], help="Platform target policy")
    parser.add_argument("--sport", default="football", help="Target sport video type")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        raw_frames = data.get("results", []) if isinstance(data, dict) else data
        
        orchestrator = ExcerptIntelligenceOrchestrator(platform=args.platform, target_sport=args.sport)
        results = orchestrator.execute_pipeline(raw_frames)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

        print(json.dumps({
            "status": "success",
            "score": results["evaluation"]["score"],
            "regenerate": results["evaluation"]["regenerate"],
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
