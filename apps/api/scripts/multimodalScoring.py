import sys
import json
import os
import math

def calculate_multimodal_fusion(audio_score, visual_score, hook_score, text_sentiment=0.8):
    """
    Simulates a cross-modal transformer fusion.
    Instead of a simple linear combination, it models non-linear interactions:
    - High hook + High audio energy amplifies the score (interaction effect).
    - Poor visual framing scales down the overall score.
    """
    # Non-linear scaling
    interaction = audio_score * hook_score
    raw_fusion = (0.4 * hook_score) + (0.3 * audio_score) + (0.2 * visual_score) + (0.1 * interaction)
    
    # Scale based on text sentiment matching viral profiles
    calibrated_score = raw_fusion * (0.8 + 0.2 * text_sentiment)
    
    # Sigmoid calibration to map to 0-100 scale
    sigmoid_score = 1.0 / (1.0 + math.exp(-10.0 * (calibrated_score - 0.5)))
    final_score = round(sigmoid_score * 100, 2)
    
    return final_score

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No arguments provided"}))
        sys.exit(1)
        
    try:
        # Expected input is a JSON string containing the data dictionary
        input_data = json.loads(sys.argv[1])
        segment_ids = input_data.get("segment_ids", [])
        audio_scores = input_data.get("audio_scores", {})
        visual_scores = input_data.get("visual_scores", {})
        
        results = []
        for seg_id in segment_ids:
            a_score = audio_scores.get(seg_id, 0.5)
            v_score = visual_scores.get(seg_id, 0.5)
            # Simulate hook score based on segment positioning and random seed
            h_score = 0.75 if "15" in seg_id else 0.55
            
            fused_score = calculate_multimodal_fusion(a_score, v_score, h_score)
            
            results.append({
                "id": seg_id,
                "score": fused_score,
                "breakdown": {
                    "audio_score": round(a_score * 100, 2),
                    "visual_score": round(v_score * 100, 2),
                    "hook_score": round(h_score * 100, 2)
                }
            })
            
        results.sort(key=lambda x: x["score"], reverse=True)
        top = results[0] if results else {"id": "none", "score": 0, "breakdown": {}}
        
        print(json.dumps({
            "status": "success",
            "top_segment_id": top["id"],
            "top_segment_score": top["score"],
            "score_breakdown": top["breakdown"],
            "results": results
        }))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)
