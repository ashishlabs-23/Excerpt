import os
import json
from viral_pipeline import main_pipeline

def validate_transparency():
    """
    Validation Test for Decision Transparency.
    Checks that stages 3-12 contain all required fields.
    """
    sample_url = "https://youtu.be/DJWtXcafOH8?si=HEURb5sUO2Xm7rmH"
    print("="*60)
    print("RUNNING TRANSPARENCY VALIDATION TEST")
    print("="*60)
    
    raw_results = main_pipeline(sample_url)
    results = raw_results.get("final_output", {})
    
    # Requirements mapping
    requirements = {
        "stage_3": ["total_segments", "segment_ids"],
        "stage_4": ["average_audio_score", "top_audio_segment"],
        "stage_5": ["segments_with_faces", "highest_motion_segment"],
        "stage_6": ["top_segment_id", "top_segment_score", "score_breakdown", "weights_used", "reason_for_selection"],
        "stage_7": ["selected_timestamp", "reason"],
        "stage_8": ["original_hook_score", "new_title", "improvement_reason"],
        "stage_9": ["hashtag_count", "caption_length"],
        "stage_10": ["verdict", "issues_detected"],
        "stage_11": ["clip_duration", "resolution"],
        "stage_12": ["best_signal", "confidence_level"]
    }
    
    found_errors = False
    
    for stage_key, fields in requirements.items():
        if stage_key not in results:
            print(f"Transparency error: {stage_key} missing entire output")
            found_errors = True
            continue
            
        stage_data = results[stage_key]
        
        # If stage was skipped or failed, it might not have the fields. 
        # But for this validation, we want to know if they SHOULD have worked.
        if stage_data.get("status") == "skipped":
            print(f"Warning: {stage_key} was skipped, skipping field validation.")
            continue
            
        for field in fields:
            if field not in stage_data:
                print(f"Transparency error: {stage_key} missing {field}")
                found_errors = True

    print("\n" + "="*60)
    if not found_errors:
        print("RESULT: ALL TRANSPARENCY FIELDS VALIDATED SUCCESSFULY")
    else:
        print("RESULT: TRANSPARENCY VALIDATION FAILED")
    print("="*60)

if __name__ == "__main__":
    validate_transparency()
