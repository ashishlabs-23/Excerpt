import json
from viral_pipeline import ViralPipeline

def check_reliability(iterations=5):
    pipeline = ViralPipeline(output_dir="temp/ollama_reliability")
    transcript = "Welcome to the show. This is a game changing viral moment. You won't believe what happens next."
    context = {"transcript": transcript, "new_title": "The AI Revolution"}
    
    success = 0
    failures = 0
    
    print(f"--- OLLAMA STRESS TEST ({iterations} iterations) ---")
    for i in range(iterations):
        print(f"Iteration {i+1}...", end=" ", flush=True)
        res = pipeline.stage_8_hook_rewrite(context)
        if not res.get("fallback_used", False):
            success += 1
            print("SUCCESS")
        else:
            failures += 1
            print("FAILED (FALLBACK)")
            
    print(f"\nFinal Result: {success}/{iterations} Successes ({(success/iterations)*100}% Reliability)")
    return success, failures

if __name__ == "__main__":
    check_reliability()
