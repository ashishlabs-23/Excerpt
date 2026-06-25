import json
import os
from viral_pipeline import ViralPipeline

def run_test():
    url = "https://youtu.be/DJWtXcafOH8?si=HEURb5sUO2Xm7rmH"
    print(f"Starting Real-World Scaling Test for URL: {url}")
    
    # Initialize pipeline with the URL (it will auto-extract duration)
    pipeline = ViralPipeline(output_dir="temp/user_url_test")
    
    # Run the main pipeline
    # We suppress the intermediate stage logs for the massive segment list
    # but the duration/scaling logic will still execute.
    print("Orchestrating 14-Stage Pipeline...")
    results = pipeline.run_pipeline(url)
    
    print("\n" + "="*50)
    print("FRONTEND RESULT BASIS (Job Complete Payload)")
    print("="*50)
    
    # Format the payload as it would appear in the Next.js frontend state
    frontend_payload = {
        "jobId": "nx_" + os.path.basename(results["video_path"]),
        "status": "completed",
        "videoInfo": {
            "url": results["url"],
            "duration": f"{results['duration_sec'] // 60}:{results['duration_sec'] % 60:02d}",
            "segmentsProcessed": results["segment_count"]
        },
        "performance": {
            "totalTime": results["timing_report"]["total_ms"],
            "avgStageTime": results["timing_report"]["avg_ms"],
            "slowestStage": results["timing_report"]["slowest_stage"]
        },
        "audit": {
            "passed": results["audit_report"].get("passed", False) if "audit_report" in results else "N/A",
            "warnings": results["audit_report"].get("warnings", []) if "audit_report" in results else []
        },
        "output": {
            "finalClip": "/storage/clips/video_viral.mp4",
            "thumbnail": "/storage/thumbnails/thumb.jpg",
            "subtitles": "/storage/subs/video.srt"
        }
    }
    
    print(json.dumps(frontend_payload, indent=2))
    print("="*50)
    
    print("\nSTAGE 6 DEBUG DATA (Ranking & Correlation)")
    print("-" * 50)
    stage_6 = results.get("final_output", {}).get("stage_6", {})
    print(json.dumps(stage_6, indent=2))
    print("-" * 50)
    
    # Validation for Step 5 of the request
    required_keys = ["top_segment_id", "top_segment_score", "score_breakdown", "weights_used", "reason_for_selection"]
    missing = [k for k in required_keys if k not in stage_6]
    if missing:
        print(f"⚠️ WARNING: Missing Stage 6 keys: {missing}")
    else:
        print("✅ Stage 6 Metadata: COMPLETE")

if __name__ == "__main__":
    run_test()
