import os
import sys
import json
import unittest
from pathlib import Path
from apps.api.scripts.transcript_service import WhisperXTranscriptEngine

class TestTranscriptService(unittest.TestCase):
    def setUp(self):
        self.temp_audio = Path("temp/mock_test_audio.mp3")
        self.temp_audio.parent.mkdir(parents=True, exist_ok=True)
        # Create a mock silent audio file using an empty text placeholder for mock testing
        with open(self.temp_audio, 'w') as f:
            f.write("MOCK MP3 DATA")

    def tearDown(self):
        if self.temp_audio.exists():
            self.temp_audio.unlink()

    def test_fallback_alignment_schema(self):
        """Verify that the fallback alignment structure matches the required WhisperX output schema."""
        engine = WhisperXTranscriptEngine(use_gpu=False)
        result = engine.transcribe_and_align(self.temp_audio)
        
        self.assertIn("segments", result)
        self.assertIn("words", result)
        self.assertTrue(len(result["segments"]) > 0)
        self.assertTrue(len(result["words"]) > 0)
        
        # Test individual word schema parameters
        first_word = result["words"][0]
        self.assertIn("word", first_word)
        self.assertIn("start", first_word)
        self.assertIn("end", first_word)
        self.assertIn("confidence", first_word)
        self.assertIsInstance(first_word["word"], str)
        self.assertIsInstance(first_word["start"], (int, float))
        self.assertIsInstance(first_word["confidence"], float)

if __name__ == "__main__":
    unittest.main()
