import sys
import unittest

sys.path.append("apps/api/scripts")
from story_engine import StoryArcEngine

class TestStoryArcEngine(unittest.TestCase):
    def test_complete_story_arc(self):
        engine = StoryArcEngine()
        
        # Simulating 10 segments of a story
        segments = [
            # Setup
            {"timestamp": 0.0, "duration": 2.0, "transcript": "Here we are at the championship game.", "motion": {"magnitude": 0.01}, "emotion": {"joy": 0.1}, "events": []},
            {"timestamp": 2.0, "duration": 2.0, "transcript": "The players are lining up on the court.", "motion": {"magnitude": 0.02}, "emotion": {"arousal": 0.2}, "events": []},
            # Build-up
            {"timestamp": 4.0, "duration": 2.0, "transcript": "Suddenly, Curry gets the pass and starts running!", "motion": {"magnitude": 0.05, "density": 0.4}, "emotion": {"arousal": 0.4}, "events": ["dribble"]},
            {"timestamp": 6.0, "duration": 2.0, "transcript": "He crosses the half-court line with speed!", "motion": {"magnitude": 0.07, "density": 0.6}, "emotion": {"arousal": 0.5}, "events": ["cross"]},
            # Tension
            {"timestamp": 8.0, "duration": 2.0, "transcript": "Only five seconds left on the game clock!", "motion": {"magnitude": 0.08, "density": 0.5}, "emotion": {"surprise": 0.6}, "events": []},
            {"timestamp": 10.0, "duration": 2.0, "transcript": "He pulls up for a deep three-pointer!", "motion": {"magnitude": 0.09, "density": 0.6}, "emotion": {"arousal": 0.7}, "events": ["shot"]},
            # Climax
            {"timestamp": 12.0, "duration": 2.0, "transcript": "Oh my god, it goes in! A buzzer-beater!", "motion": {"magnitude": 0.12, "density": 0.9}, "emotion": {"surprise": 0.95, "joy": 0.9}, "events": ["three_pointer"]},
            # Payoff
            {"timestamp": 14.0, "duration": 2.0, "transcript": "The crowd goes absolutely wild!", "motion": {"magnitude": 0.10, "density": 0.8}, "emotion": {"laughter": 0.9, "joy": 0.95}, "events": ["crowd_reaction", "celebration"]},
            {"timestamp": 16.0, "duration": 2.0, "transcript": "What an incredible finish to the season.", "motion": {"magnitude": 0.04}, "emotion": {"joy": 0.8}, "events": []},
            {"timestamp": 18.0, "duration": 2.0, "transcript": "Signing off from the arena.", "motion": {"magnitude": 0.01}, "emotion": {"joy": 0.2}, "events": []}
        ]
        
        results = engine.analyze_timeline(segments)
        
        self.assertGreater(results["arc_score"], 0.70)
        self.assertTrue(len(results["optimized_clips"]) > 0)
        
        # Verify stages
        stages = [item["stage"] for item in results["story_arc"]]
        self.assertIn("Setup", stages)
        self.assertIn("Build-up", stages)
        self.assertIn("Tension", stages)
        self.assertIn("Climax", stages)
        self.assertIn("Payoff", stages)
        
        # Climax should be the 3-pointer buzzer beater frame (index 6)
        self.assertEqual(results["story_arc"][6]["stage"], "Climax")

if __name__ == "__main__":
    unittest.main()
