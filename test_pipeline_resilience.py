import json
import os
import sys
from viral_pipeline import main_pipeline

# Ensure UTF-8 output for Windows consoles to handle emojis if needed, 
# but we'll switch to text-only indicators for maximum compatibility.
def log_val(msg, success=True):
    prefix = "[PASS]" if success else "[FAIL]"
    print(f"{prefix} {msg}")

def verify_pipeline_resilience():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    
    # Test Case 1: Audio Failure
    print("\n--- TEST: FORCED AUDIO FAILURE ---")
    try:
        out_audio = main_pipeline(url, force_fail={"audio": True})
        res = out_audio["final_output"]
        debug = out_audio["debug_data"]
        
        # 1. Verify failed module
        status = res.get("stage_4", {}).get("status")
        log_val("Stage 4 marked as 'skipped'.", status == "skipped")
            
        # 2. Verify pipeline continuation
        cont = "stage_6" in res and "stage_11" in res
        log_val("Pipeline continued to Stage 6 and Stage 11.", cont)
            
        # 3. Verify fallback behavior
        scores = res.get("stage_4", {}).get("audio_scores")
        log_val("audio_scores is empty list.", scores == [])
            
        # 4. Verify debug_data
        log_val("debug_data exists.", debug is not None and "run_id" in debug)
            
        print("Result: Audio resilience validations complete.")
    except Exception as e:
        print(f"CRASH: Audio test encountered an error: {e}")

    # Test Case 2: Visual Failure
    print("\n--- TEST: FORCED VISUAL FAILURE ---")
    try:
        out_visual = main_pipeline(url, force_fail={"visual": True})
        res = out_visual["final_output"]
        debug = out_visual["debug_data"]
        
        # 1. Verify failed module
        status = res.get("stage_5", {}).get("status")
        log_val("Stage 5 marked as 'skipped'.", status == "skipped")
        
        # 2. Verify pipeline continuation
        cont = "stage_6" in res and "stage_11" in res
        log_val("Pipeline continued to Stage 6 and Stage 11.", cont)
            
        # 3. Verify fallback behavior
        scores = res.get("stage_5", {}).get("visual_scores")
        log_val("visual_scores is empty list.", scores == [])
            
        # 4. Verify debug_data
        log_val("debug_data exists.", debug is not None)
            
        print("Result: Visual resilience validations complete.")
    except Exception as e:
        print(f"CRASH: Visual test encountered an error: {e}")

    # Test Case 3: Ollama JSON Failure
    print("\n--- TEST: FORCED OLLAMA JSON CORRUPTION ---")
    try:
        # Note: Any connection error also triggers fallback, but ollama_json=True specifically 
        # mocks a JSON decode error if the connection actually succeeds.
        out_ollama = main_pipeline(url, force_fail={"ollama_json": True})
        res = out_ollama["final_output"]
        debug = out_ollama["debug_data"]
        
        rewrite_res = res.get("stage_8", {})
        
        # 3. Verify fallback behavior
        fallback = rewrite_res.get("fallback_used") == True
        log_val("fallback_used == True for Ollama failure.", fallback)
            
        # 2. Verify pipeline continuation
        past = "stage_9" in res and "stage_11" in res
        log_val("Pipeline continued past Stage 8 failure.", past)
            
        # 4. Verify debug_data
        log_val("debug_data exists.", debug is not None)
            
        print("Result: Ollama resilience validations complete.")
    except Exception as e:
        print(f"CRASH: Ollama test encountered an error: {e}")

if __name__ == "__main__":
    verify_pipeline_resilience()
    print("\n========================================")
    print("ENHANCED RESILIENCE VERIFICATION COMPLETE")
    print("========================================")
