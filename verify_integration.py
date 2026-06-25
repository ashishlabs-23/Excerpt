import requests
import time
import sys

BASE_URL = "http://127.0.0.1:8010"
TEST_URL = "https://www.youtube.com/watch?v=ScMzIvxBSi4"

def test_full_pipeline():
    print(f"--- Starting Integration Test: {TEST_URL} ---")
    
    # 1. Start Job
    print(f"[1/3] Initiating Gen-3 Sequence...")
    payload = {"videoUrl": TEST_URL, "numClips": 1}
    try:
        resp = requests.post(f"{BASE_URL}/api/video/generate-clips", json=payload)
        resp.raise_for_status()
        data = resp.json()
        job_id = data.get("jobId")
        if not job_id:
            print("FAILED: No jobId in response")
            return
        print(f"SUCCESS: Job ID: {job_id}")
    except Exception as e:
        print(f"FAILED: Initial request - {e}")
        return

    # 2. Poll Status
    print(f"[2/3] Polling status for {job_id}...")
    start_time = time.time()
    while time.time() - start_time < 300:  # 5 min timeout
        try:
            resp = requests.get(f"{BASE_URL}/api/video/status/{job_id}")
            resp.raise_for_status()
            data = resp.json()
            status = data.get("status")
            progress = data.get("progress", 0)
            
            print(f"STATUS: {status} ({progress}%)")
            
            if status == "completed":
                print("SUCCESS: Job completed.")
                # 3. Verify Response Fields
                verify_results(data.get("result", []))
                return
            if status == "failed":
                print(f"FAILED: Job reached failed state. Reason: {data.get('failedReason')}")
                return
        except Exception as e:
            print(f"WARNING: Polling error - {e}")
            
        time.sleep(5)
    
    print("FAILED: Global timeout reached.")

def verify_results(clips):
    print(f"[3/3] Verifying clip metadata schema...")
    if not clips:
        print("FAILED: No clips in result array.")
        return
    
    required_fields = ["video_file", "thumbnail_file", "title", "caption"]
    all_ok = True
    
    for i, clip in enumerate(clips):
        missing = [f for f in required_fields if not clip.get(f)]
        if missing:
            print(f"FAILED: Clip {i} missing fields: {missing}")
            all_ok = False
        else:
            print(f"SUCCESS: Clip {i} contains all integration fields.")
            print(f"  - Title: {clip['title']}")
            print(f"  - Video: {clip['video_file']}")
            print(f"  - Thumb: {clip['thumbnail_file']}")

    if all_ok:
        print("\n--- INTEGRATION VALIDATED: PRODUCTION READY ---")
    else:
        print("\n--- INTEGRATION FAILED: SCHEMA MISMATCH ---")

if __name__ == "__main__":
    test_full_pipeline()
