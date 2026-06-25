import json
from viral_pipeline import ViralPipeline

def test_stage_12_safety():
    pipeline = ViralPipeline()
    mock_data = {"top_segment_score": 42.0}

    print("\n--- TEST: SMALL DATASET (< 20 rows) ---")
    small_history = [{"run_id": f"run_{i}"} for i in range(10)]
    res_small = pipeline.stage_12_learning(mock_data, history=small_history)
    
    print(f"Best Signal: {res_small.get('best_signal')}")
    print(f"Confidence Level: {res_small.get('confidence_level')}")
    
    assert res_small.get("best_signal") == "no change recommended"
    assert res_small.get("confidence_level") < 0.6
    print("✅ Small Dataset Safety Verified")

    print("\n--- TEST: LARGE DATASET (> 50 rows) ---")
    large_history = [{"run_id": f"run_{i}"} for i in range(60)]
    res_large = pipeline.stage_12_learning(mock_data, history=large_history)
    
    best_signal = res_large.get('best_signal')
    confidence = res_large.get('confidence_level')
    weights = res_large.get("recommended_weights", {})
    
    print(f"Best Signal: {best_signal}")
    print(f"Confidence Level: {confidence}")
    print(f"Recommended Weights: {weights}")
    
    assert best_signal != "no change recommended"
    assert 0.4 <= weights.get("original", 0) <= 0.8
    assert res_large.get("status") == "recommendation_only"
    
    # Test weight refinement logic
    if confidence > 0.8:
        assert weights.get("visual") == 0.2, f"Expected visual=0.2, got {weights.get('visual')}"
        assert weights.get("original") == 0.6, f"Expected original=0.6, got {weights.get('original')}"
        print("✅ High Confidence Weight Refinement Verified")

    print("✅ Large Dataset Safety & Weight Ranges Verified")

if __name__ == "__main__":
    try:
        test_stage_12_safety()
        print("\n========================================")
        print("ALL LEARNING MODULE SAFETY TESTS PASSED")
        print("========================================")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        exit(1)
