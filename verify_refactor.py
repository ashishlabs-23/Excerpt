from viral_pipeline import ViralPipeline
import json

def test_new_orchestrator():
    url = "https://youtu.be/DJWtXcafOH8?si=HEURb5sUO2Xm7rmH"
    pipeline = ViralPipeline(output_dir="temp/refactor_verify")
    
    print(f"🚀 Running Refactored Pipeline for: {url}")
    report = pipeline.run_pipeline(url)
    
    print("\n--- FRONTEND-READY PAYLOAD CHECK ---")
    print(f"URL: {report.get('url')}")
    print(f"Duration: {report.get('duration_sec')}s")
    print(f"Segments: {report.get('segment_count')}")
    print(f"Timing Total: {report.get('timing_report', {}).get('total_ms')}ms")
    print(f"Audit Passed: {report.get('audit_report', {}).get('passed')}")
    
    # Verify main keys exist
    expected_keys = ["url", "duration_sec", "video_path", "final_output", "timing_report", "audit_report", "segment_count"]
    missing = [k for k in expected_keys if k not in report]
    
    if not missing:
        print("\n✅ Verification Successful: All expected frontend keys present.")
    else:
        print(f"\n❌ Verification Failed: Missing keys {missing}")

if __name__ == "__main__":
    test_new_orchestrator()
