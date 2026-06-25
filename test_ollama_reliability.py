import json
import time
import requests
from viral_pipeline import ViralPipeline

def test_ollama_reliability():
    """
    Stresstest for Ollama JSON reliability.
    Runs Stage 8 and Stage 9 five times to check for valid JSON and fields.
    """
    pipeline = ViralPipeline()
    # Mock context data
    context = {
        "transcript": "In this video, I reveal the secret to scaling your startup from zero to one million users in under six months.",
        "new_title": "Scale Your Startup To 1M Users"
    }
    
    total_runs = 0
    successful_parses = 0
    failed_parses = 0
    
    print("="*60)
    print("TESTING OLLAMA INTEGRATION RELIABILITY (5 RUNS)")
    print("="*60)
    
    for i in range(1, 6):
        print(f"\n--- Run {i} ---")
        
        # Test Stage 8 (Hook Rewrite)
        print("Testing Stage 8 (Hook Rewrite)...")
        res8 = pipeline.stage_8_hook_rewrite(context)
        total_runs += 1
        
        # Check if fallback was used (which implies a parse/connection failure)
        is_fallback_8 = "Manual fallback used" in res8.get("improvement_reason", "")
        
        if not is_fallback_8:
            # Check fields
            required_8 = ["viral_hook", "improvement_reason", "new_title"]
            if all(k in res8 for k in required_8):
                print("Stage 8: Success (Valid JSON + Fields)")
                successful_parses += 1
            else:
                print("Stage 8: Failed (Missing Fields in JSON)")
                failed_parses += 1
        else:
            print("Stage 8: Failed (Parse Error/Timeout - Fallback Used)")
            failed_parses += 1
            
        # Test Stage 9 (Metadata Generation)
        print("Testing Stage 9 (Metadata)...")
        res9 = pipeline.stage_9_metadata(context)
        total_runs += 1
        
        is_fallback_9 = res9.get("caption") == "Fallback caption."
        
        if not is_fallback_9:
            # Check fields
            required_9 = ["hashtags", "caption"]
            if all(k in res9 for k in required_9):
                print("Stage 9: Success (Valid JSON + Fields)")
                successful_parses += 1
            else:
                print("Stage 9: Failed (Missing Fields in JSON)")
                failed_parses += 1
        else:
            print("Stage 9: Failed (Parse Error/Timeout - Fallback Used)")
            failed_parses += 1
            
        time.sleep(1) # Small delay between runs

    print("\n" + "="*60)
    print("OLLAMA RELIABILITY REPORT")
    print(f"Total Module Calls: {total_runs}")
    print(f"Successful Parses:   {successful_parses}")
    print(f"Failed Parses:       {failed_parses}")
    print(f"Reliability Rate:    {(successful_parses/total_runs)*100:.1f}%")
    print("="*60)

if __name__ == "__main__":
    test_ollama_reliability()
