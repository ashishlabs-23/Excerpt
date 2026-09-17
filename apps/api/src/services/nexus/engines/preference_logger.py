import os
import sys
import json
import argparse
import uuid

class ExcerptPreferenceLogger:
    def __init__(self, output_dir="temp"):
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def log_preference_matchup(self, matchup_data):
        """
        Saves matchup editor vote comparison logs to Preference Database representation.
        """
        matchup_uuid = str(uuid.uuid4())
        
        # Build Preference Table Row
        preference_log = {
            "matchup_uuid": matchup_uuid,
            "video_type": matchup_data.get("video_type", "football"),
            "platform": matchup_data.get("platform", "tiktok"),
            "clip_duration": matchup_data.get("clip_duration", 15.0),
            "caption_style": matchup_data.get("caption_style", "neon"),
            "editor_strategy": matchup_data.get("editor_strategy", "emotion_first"),
            "winner_clip_id": matchup_data.get("winner_clip_id"),
            "loser_clip_id": matchup_data.get("loser_clip_id"),
            "winner_reason": matchup_data.get("winner_reason", "better_crop"),
            "editor_user_id": matchup_data.get("editor_user_id", "anonymous")
        }

        # Build Pairwise Reward Sample Row
        reward_sample = {
            "matchup_uuid": matchup_uuid,
            "chosen_features": matchup_data.get("chosen_features", {}),
            "rejected_features": matchup_data.get("rejected_features", {})
        }

        # Save to simulated DB files (in production, these execute SQL inserts)
        pref_file = os.path.join(self.output_dir, f"preference_{matchup_uuid}.json")
        with open(pref_file, "w", encoding="utf-8") as f:
            json.dump(preference_log, f, indent=2)

        reward_file = os.path.join(self.output_dir, f"reward_{matchup_uuid}.json")
        with open(reward_file, "w", encoding="utf-8") as f:
            json.dump(reward_sample, f, indent=2)

        return matchup_uuid

    def log_telemetry(self, telemetry_data):
        """
        Saves production metrics (render time, failure rates, repair count).
        """
        job_uuid = str(uuid.uuid4())
        
        telemetry_log = {
            "job_uuid": job_uuid,
            "render_time_ms": telemetry_data.get("render_time_ms", 1500),
            "gpu_memory_used_mb": telemetry_data.get("gpu_memory_used_mb", 1024),
            "failure_rate": telemetry_data.get("failure_rate", 0.0),
            "crop_repair_count": telemetry_data.get("crop_repair_count", 0),
            "caption_repair_count": telemetry_data.get("caption_repair_count", 0),
            "critic_score": telemetry_data.get("critic_score", 90.0),
            "candidate_count": telemetry_data.get("candidate_count", 3)
        }

        telemetry_file = os.path.join(self.output_dir, f"telemetry_{job_uuid}.json")
        with open(telemetry_file, "w", encoding="utf-8") as f:
            json.dump(telemetry_log, f, indent=2)

        return job_uuid

def main():
    parser = argparse.ArgumentParser(description="Excerpt Preference & Telemetry Logger")
    parser.add_argument("--action", required=True, choices=["preference", "telemetry"], help="Logging action")
    parser.add_argument("--data-json", required=True, help="Path to input JSON payload")
    parser.add_argument("--output-dir", default="temp", help="Output log directory")
    args = parser.parse_args()

    try:
        with open(args.data_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        logger = ExcerptPreferenceLogger(output_dir=args.output_dir)
        
        if args.action == "preference":
            uuid_res = logger.log_preference_matchup(data)
        else:
            uuid_res = logger.log_telemetry(data)

        print(json.dumps({
            "status": "success",
            "log_uuid": uuid_res,
            "action": args.action
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
