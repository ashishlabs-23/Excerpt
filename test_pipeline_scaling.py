import os
import json
from viral_pipeline import main_pipeline

def run_scaling_tests():
    scenarios = [
        {"name": "Short", "duration": 30},
        {"name": "Medium", "duration": 120},
        {"name": "Long", "duration": 300}
    ]
    
    results_summary = []
    
    print("="*50)
    print("STARTING PIEPLINE SCALING VERIFICATION")
    print("="*50)
    
    for sc in scenarios:
        print(f"\n>>> RUNNING SCENARIO: {sc['name']} ({sc['duration']}s)")
        out_dir = f"temp/scaling_test_{sc['name'].lower()}"
        
        # Run pipeline
        res = main_pipeline(
            url="https://example.com/video.mp4",
            output_dir=out_dir,
            duration_sec=sc['duration']
        )
        
        # Extract metrics
        timing = res.get("timing_report", {})
        results_summary.append({
            "Scenario": sc['name'],
            "Duration": f"{sc['duration']}s",
            "Segments": res.get("segment_count", 0),
            "Total Time": f"{timing.get('total_time_ms', 0):.1f}ms",
            "Avg/Stage": f"{timing.get('avg_stage_time_ms', 0):.1f}ms",
            "Slowest": f"{timing.get('slowest_stage', 'N/A')} ({timing.get('slowest_stage_time_ms', 0):.1f}ms)"
        })

    # Print Final Markdown Table
    print("\n" + "="*50)
    print("FINAL SCALING PERFORMANCE COMPARISON")
    print("="*50)
    
    header = "| Scenario | Duration | Segments | Total Time | Avg/Stage | Slowest Stage |"
    sep = "|---" * 6 + "|"
    print(header)
    print(sep)
    for r in results_summary:
        row = f"| {r['Scenario']} | {r['Duration']} | {r['Segments']} | {r['Total Time']} | {r['Avg/Stage']} | {r['Slowest']} |"
        print(row)
    print("="*50)

if __name__ == "__main__":
    run_scaling_tests()
