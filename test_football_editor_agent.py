import sys
import unittest

sys.path.append("apps/api/scripts")
from football_editor_agent import FootballEditorAgent

class TestFootballEditorAgent(unittest.TestCase):
    def test_editor_agent_boundary_policies(self):
        agent = FootballEditorAgent()
        
        # Test goal policy
        goal_clip = agent.edit_clip("goal", 100.0)
        self.assertEqual(goal_clip["clip_start"], 88.0)  # 100 - 12 pre-roll
        self.assertEqual(goal_clip["clip_end"], 108.0)   # 100 + 8 post-roll
        self.assertEqual(goal_clip["policy"], "Goal Narrative Policy")

        # Test penalty policy
        penalty_clip = agent.edit_clip("penalty", 250.0)
        self.assertEqual(penalty_clip["clip_start"], 232.0)  # 250 - 18
        self.assertEqual(penalty_clip["clip_end"], 255.0)   # 250 + 5
        self.assertEqual(penalty_clip["policy"], "Spot Placement Policy")

if __name__ == "__main__":
    unittest.main()
