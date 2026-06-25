import os
import shutil
from unittest.mock import patch
from viral_pipeline import main_pipeline, ViralPipeline

@patch.object(ViralPipeline, '_call_ollama_with_retry')
def test_quality_audit_mock(mock_ollama):
    mock_ollama.return_value = {
        "tiktok": {"hook": "Wait until the end!", "caption": "Mind-blowing insight!"},
        "youtube_shorts": {"seo_title": "Game Changing Viral Moment", "keywords": "ai, tech, viral", "description": "This changes everything."},
        "instagram_reels": {"hashtags": ["viral", "trending", "clips"], "description": "You won't believe this."},
        "b_roll_suggestions": ["conceptual technology animation"],
        "viral_hook": "Mock Hook",
        "new_title": "Mock Title"
    }
    
    print("\n--- TEST: QUALITY AUDIT (MOCK MODE) ---")
    output_dir = "temp/audit_test_mock"
    if os.path.exists(output_dir): shutil.rmtree(output_dir)
    os.makedirs(output_dir)
    
    # Patch stage_7_thumbnail to return skipped, so the thumbnail file won't exist
    with patch.object(ViralPipeline, 'stage_7_thumbnail', return_value={"status": "skipped"}):
        res = main_pipeline("https://example.com/video", output_dir=output_dir)
            
    audit = res['final_output']['stage_13']
    
    print(f"Audit Passed: {audit['passed']}")
    print(f"Warnings: {audit['warnings']}")
    
    assert "Thumbnail file (.jpg) missing." in audit['warnings']
    assert audit['passed'] is False
    print("✅ Verified: Correctly detected missing thumbnail in mock.")

@patch.object(ViralPipeline, '_call_ollama_with_retry')
def test_quality_audit_pass(mock_ollama):
    mock_ollama.return_value = {
        "tiktok": {"hook": "Wait until the end!", "caption": "Mind-blowing insight!"},
        "youtube_shorts": {"seo_title": "Game Changing Viral Moment", "keywords": "ai, tech, viral", "description": "This changes everything."},
        "instagram_reels": {"hashtags": ["viral", "trending", "clips"], "description": "You won't believe this."},
        "b_roll_suggestions": ["conceptual technology animation"],
        "viral_hook": "Mock Hook",
        "new_title": "Mock Title"
    }
    
    print("\n--- TEST: QUALITY AUDIT (PASS MODE) ---")
    output_dir = "temp/audit_test_pass"
    if os.path.exists(output_dir): shutil.rmtree(output_dir)
    os.makedirs(output_dir)
    
    # Pre-create all files
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, "clip.mp4"), "w") as f: f.write("dummy content")
    with open(os.path.join(output_dir, "clip.srt"), "w") as f: f.write("dummy content")
    with open(os.path.join(output_dir, "thumb_01.jpg"), "w") as f: f.write("dummy content")
    
    # Run pipeline
    res = main_pipeline("https://example.com/video", output_dir=output_dir)
    audit = res['final_output']['stage_13']
    
    print(f"Audit Passed: {audit['passed']}")
    print(f"Warnings: {audit['warnings']}")
    
    assert audit['passed'] is True
    print("✅ Verified: Audit passed when all files exist.")

if __name__ == "__main__":
    # Call directly if run as main
    test_quality_audit_mock()
    test_quality_audit_pass()
