import sys
import unittest

sys.path.append("apps/api/scripts")
from speaker_service import map_words_to_speakers, build_active_speaker_timeline

class TestSpeakerService(unittest.TestCase):
    def test_map_words_to_speakers_overlap(self):
        diarization = [
            {"speaker": "SPEAKER_00", "start": 0.0, "end": 2.0},
            {"speaker": "SPEAKER_01", "start": 2.0, "end": 4.0}
        ]
        words = [
            {"word": "Hello", "start": 0.5, "end": 1.0},
            {"word": "world", "start": 2.2, "end": 2.8}
        ]
        mapped, speaker_map = map_words_to_speakers(words, diarization)
        
        self.assertEqual(speaker_map["SPEAKER_00"], "A")
        self.assertEqual(speaker_map["SPEAKER_01"], "B")
        
        self.assertEqual(mapped[0]["speaker"], "A")
        self.assertEqual(mapped[1]["speaker"], "B")

    def test_map_words_to_speakers_fallback(self):
        # Silence gap between 2.0 and 3.0
        diarization = [
            {"speaker": "SPEAKER_00", "start": 0.0, "end": 2.0},
            {"speaker": "SPEAKER_01", "start": 3.0, "end": 5.0}
        ]
        words = [
            # Word starts in the gap, but closer to SPEAKER_00 (at 2.2s)
            {"word": "CloseToA", "start": 2.1, "end": 2.3},
            # Word starts in the gap, but closer to SPEAKER_01 (at 2.8s)
            {"word": "CloseToB", "start": 2.7, "end": 2.9}
        ]
        mapped, _ = map_words_to_speakers(words, diarization)
        
        self.assertEqual(mapped[0]["speaker"], "A")
        self.assertEqual(mapped[1]["speaker"], "B")

    def test_build_active_speaker_timeline(self):
        mapped_words = [
            {"word": "One", "start": 0.1, "end": 0.5, "speaker": "A"},
            {"word": "Two", "start": 0.6, "end": 1.2, "speaker": "A"},
            {"word": "Three", "start": 2.0, "end": 2.5, "speaker": "B"},
            {"word": "Four", "start": 2.6, "end": 3.2, "speaker": "B"}
        ]
        timeline = build_active_speaker_timeline(mapped_words, min_segment_duration=0.3, max_merge_gap=1.5)
        
        self.assertEqual(len(timeline), 2)
        
        self.assertEqual(timeline[0]["speaker"], "A")
        self.assertEqual(timeline[0]["start"], 0.1)
        self.assertEqual(timeline[0]["end"], 1.2)
        
        self.assertEqual(timeline[1]["speaker"], "B")
        self.assertEqual(timeline[1]["start"], 2.0)
        self.assertEqual(timeline[1]["end"], 3.2)

    def test_build_active_speaker_timeline_noise_filter(self):
        mapped_words = [
            # Very short segment (duration 0.1s)
            {"word": "Noise", "start": 0.1, "end": 0.2, "speaker": "A"},
            # Longer segment (duration 1.0s)
            {"word": "Speech", "start": 1.0, "end": 2.0, "speaker": "B"}
        ]
        # Filter anything below 0.3s
        timeline = build_active_speaker_timeline(mapped_words, min_segment_duration=0.3)
        
        self.assertEqual(len(timeline), 1)
        self.assertEqual(timeline[0]["speaker"], "B")
        self.assertEqual(timeline[0]["start"], 1.0)
        self.assertEqual(timeline[0]["end"], 2.0)

if __name__ == "__main__":
    unittest.main()
