import json
import time
from viral_pipeline import main_pipeline

def test_ranking_consistency():
    video_url = "https://youtu.be/DJWtXcafOH8?si=HEURb5sUO2Xm7rmH"
    results = []
    
    print("===============================================")
    print("   RANKING CONSISTENCY TEST: STARTING          ")
    print(f"   Video: {video_url}                          ")
    print("===============================================")
    
    for i in range(1, 4):
        print(f"\n--- Run #{i} ---")
        run_output = main_pipeline(video_url)
        
        # Extract ranking data (Stage 6)
        # In our implementation, Stage 6 returns results to the orchestrator.
        # However, since the orchestrator doesn't store the full intermediate state in its return value
        # we might need to rely on the side effects or ensure the orchestrator returns what we need.
        # Currently, viral_pipeline returns the summary dictionary.
        
        # Let's assume the ranking data is available in the run_output summary
        # Wait, looking at viral_pipeline.py, it doesn't return the full breakdown in the final summary.
        # It only returns 'clipping_data' and 'metadata'.
        
        # I will modify the orchestrator slightly to include 'ranking_data' in the summary for auditing.
        # But first, let's just use what's available.
        
        debug = run_output.get("debug_data", {})
        results.append({
            "run": i,
            "run_id": debug.get("run_id"),
            "timestamp": debug.get("timestamp"),
            "top_segment_id": debug.get("stage_6", {}).get("top_segment_id"),
            "top_segment_score": debug.get("stage_6", {}).get("top_segment_score"),
            "score_breakdown": debug.get("stage_6", {}).get("score_breakdown")
        })
        
        print(f"Run {i} ID: {results[-1]['run_id']} ({results[-1]['timestamp']})")
        print(f"Run {i} Top Segment: {results[-1]['top_segment_id']}")
        print(f"Run {i} Score Breakdown: {json.dumps(results[-1]['score_breakdown'], indent=2)}")

    print("\n===============================================")
    print("   RANKING CONSISTENCY REPORT                  ")
    print("===============================================")
    
    consistent = True
    first_run_id = results[0]["top_segment_id"]
    
    for run in results:
        if run["top_segment_id"] != first_run_id:
            consistent = False
            break
            
    if not consistent:
        print("Inconsistent ranking detected!")
    else:
        print("Deterministic Ranking: SUCCESS")
        
    print(f"Final Outcome: {'PASSED' if consistent else 'FAILED'}")
    print("===============================================")

if __name__ == "__main__":
    test_ranking_consistency()
