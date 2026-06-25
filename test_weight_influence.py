import json
from viral_pipeline import main_pipeline

def run_test():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    
    # Case A: Original Heavy
    weights_a = {
        "original": 0.6,
        "audio": 0.2,
        "visual": 0.1,
        "hook": 0.1
    }
    
    # Case B: Balanced (more weight on audio/visual)
    weights_b = {
        "original": 0.4,
        "audio": 0.3,
        "visual": 0.2,
        "hook": 0.1
    }
    
    print("=== RUNNING CASE A (Original Heavy) ===")
    res_a = main_pipeline(url, weights=weights_a)
    data_a = res_a["debug_data"]["stage_6"]
    
    print("\n=== RUNNING CASE B (Balanced) ===")
    res_b = main_pipeline(url, weights=weights_b)
    data_b = res_b["debug_data"]["stage_6"]
    
    print("\n" + "="*40)
    print("WEIGHT INFLUENCE COMPARISON")
    print("="*40)
    
    print(f"CASE A Winner: {data_a['top_segment_id']} (Score: {data_a['top_segment_score']})")
    print(f"CASE A Reason: {data_a['reason_for_selection']}")
    
    print(f"CASE B Winner: {data_b['top_segment_id']} (Score: {data_b['top_segment_score']})")
    print(f"CASE B Reason: {data_b['reason_for_selection']}")
    
    if data_a['top_segment_id'] != data_b['top_segment_id']:
        print("\nRANKING CHANGE DETECTED: SUCCESS")
        print(f"Shifted from {data_a['top_segment_id']} to {data_b['top_segment_id']} based on weight adjustment.")
    else:
        print("\nRANKING UNCHANGED: (Check if scores shifted significantly)")
        
    print("\n--- WEIGHT VALIDATION ---")
    print("Weights A:", data_a.get("weights_used"))
    print("Weights B:", data_b.get("weights_used"))

    score_diff = abs(data_a['top_segment_score'] - data_b['top_segment_score'])
    print("Score Difference:", score_diff)

    if score_diff < 1:
        print("⚠️ Low sensitivity to weight change")
    
    print("="*40)

if __name__ == "__main__":
    run_test()
