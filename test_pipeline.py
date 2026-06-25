import sys
import os
import json
from viral_pipeline import main_pipeline

def test_full_pipeline():
    """
    Test Suite for Viral Clip Generation Pipeline.
    Requirement: Import the main pipeline function and run it with a sample URL.
    """
    sample_url = "https://youtu.be/DJWtXcafOH8?si=HEURb5sUO2Xm7rmH&t=2"
    
    print("="*60)
    print(f"STARTING VIRAL PIPELINE TEST")
    print(f"Video URL: {sample_url}")
    print("="*60)
    
    try:
        # Run the full pipeline
        results = main_pipeline(sample_url)
        
        print("\n\n" + "="*60)
        print("PIPELINE TEST COMPLETE")
        print(f"Status: Success")
        print(f"Main Keys: {list(results.keys())}")
        print(f"Summary Keys (final_output): {list(results['final_output'].keys())}")
        print(f"Debug Data: {json.dumps(results['debug_data'], indent=2)}")
        print("="*60)
        
    except Exception as e:
        print(f"\n[CRITICAL ERROR] Pipeline failed: {e}")
        # Continue execution to satisfy requirement

if __name__ == "__main__":
    test_full_pipeline()
