import sys
import json
import math

def predict_engagement(audio_score, visual_score, hook_score):
    """
    Predicts engagement metrics based on multi-modal scores.
    Estimates:
    - retention_score: 0-100
    - watch_through_rate: 0-100%
    - scroll_stop_probability: 0-100%
    """
    # Non-linear interaction formulas
    scroll_stop = min(100.0, (hook_score * 70.0 + audio_score * 30.0) * 1.1)
    retention = min(100.0, (visual_score * 50.0 + audio_score * 40.0 + hook_score * 10.0) * 1.05)
    
    # Watch through rate is highly dependent on both scroll stop and retention
    wtr = min(100.0, (scroll_stop * 0.4 + retention * 0.6) * 0.95)
    
    return {
        "retention_score": round(retention, 2),
        "scroll_stop_probability": round(scroll_stop, 2),
        "watch_through_rate": round(wtr, 2)
    }

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No arguments provided"}))
        sys.exit(1)
        
    try:
        input_data = json.loads(sys.argv[1])
        segment_ids = input_data.get("segment_ids", [])
        audio_scores = input_data.get("audio_scores", {})
        visual_scores = input_data.get("visual_scores", {})
        hook_scores = input_data.get("hook_scores", {})
        
        results = {}
        for seg_id in segment_ids:
            a_score = audio_scores.get(seg_id, 0.5)
            v_score = visual_scores.get(seg_id, 0.5)
            h_score = hook_scores.get(seg_id, 0.5)
            
            prediction = predict_engagement(a_score, v_score, h_score)
            results[seg_id] = prediction
            
        print(json.dumps({
            "status": "success",
            "predictions": results
        }))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
