import json
from viral_pipeline import ViralPipeline

def run_resilience_test():
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    
    # CASE: Multi-Service Offline (Audio & Visual & Ollama)
    force_fail = {
        "audio": True,
        "visual": True,
        "ollama_json": True
    }
    
    print("🚀 RUNNING MULTI-SERVICE FAILURE RESILIENCE TEST...")
    pipeline = ViralPipeline(output_dir="temp/resilience_test", force_fail=force_fail)
    report = pipeline.run_pipeline(url)
    
    print("\n" + "="*40)
    print("RESILIENCE VALIDATION")
    print("="*40)
    
    # 1. Verify Audio/Visual fallback
    audio_scores = report["final_output"]["stage_4"].get("audio_scores", {})
    visual_scores = report["final_output"]["stage_5"].get("visual_scores", {})
    
    if audio_scores == {}:
        print("✅ Audio Module failure caught cleanly.")
    else:
        print("❌ Audio Module failure NOT caught.")

    if visual_scores == {}:
        print("✅ Visual Module failure caught cleanly.")
    else:
        print("❌ Visual Module failure NOT caught.")

    # 2. Verify Ollama fallback
    stage_8 = report["final_output"]["stage_8"]
    if stage_8.get("fallback_used"):
        print("✅ Ollama JSON failure handled via fallback.")
    else:
        print("❌ Ollama JSON failure NOT handled.")

    # 3. Verify stage 6 ranking still ran
    stage_6_score = report["final_output"]["stage_6"].get("top_segment_score", 0)
    if stage_6_score > 0:
        print(f"✅ Ranking Stage continued successfully (Score: {stage_6_score})")
    else:
        print("❌ Ranking Stage failed or scores are zero.")

    # 4. Verify Final Audit Status
    audit = report["final_output"]["stage_13"]
    print(f"Audit Status: {'PASSED' if audit.get('passed') else 'FAILED'}")
    print(f"Warnings Found: {audit.get('warnings_count')}")

    print("="*40)

if __name__ == "__main__":
    run_resilience_test()
