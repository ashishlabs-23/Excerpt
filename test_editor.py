import sys
import unittest
import numpy as np

sys.path.append("apps/api/scripts")
from editor_emulation_engine import EditorEmulationEngine

class TestEditorEmulationEngine(unittest.TestCase):
    def test_ufc_broadcaster_decisions(self):
        engine = EditorEmulationEngine(broadcaster="ufc")
        
        timeline = [
            {"timestamp": 0.0, "stage": "Setup", "intensity": 0.2, "events": []},
            {"timestamp": 2.0, "stage": "Build-up", "intensity": 0.5, "events": ["dribble"]},
            # Climax knockdown
            {"timestamp": 4.0, "stage": "Climax", "intensity": 0.9, "events": ["shot"]},
            # Payoff reaction
            {"timestamp": 6.0, "stage": "Payoff", "intensity": 0.6, "events": ["celebration"]},
            {"timestamp": 8.0, "stage": "Payoff", "intensity": 0.3, "events": []}
        ]
        
        decisions = engine.recommend_decisions(timeline)
        
        # Verify decisions list length matches timeline
        self.assertEqual(len(decisions), 5)
        
        # Climax frame should cut to tight and apply zoom factor >= 1.5
        climax_dec = decisions[2]
        self.assertEqual(climax_dec["camera_state"], "Tight")
        self.assertGreaterEqual(climax_dec["zoom_factor"], 1.5)
        
        # Payoff frame following climax should recommend replay
        payoff_dec = decisions[3]
        self.assertTrue(payoff_dec["replay_placement"])
        self.assertEqual(payoff_dec["replay_source"], 4.0)

    def test_training_pipeline(self):
        engine = EditorEmulationEngine(broadcaster="fifa")
        
        # Mock training logs containing sequences of transitions
        broadcast_logs = [
            {"sequence": ["wide", "tight", "reaction", "wide"]},
            {"sequence": ["wide", "tight", "reaction", "replay", "wide"]}
        ]
        
        # Train
        engine.train_from_logs(broadcast_logs)
        
        # Verify transitions
        # From reaction (index 2), the trained transitions go to either wide (0) or replay (3)
        reaction_probs = engine.matrix[2]
        self.assertGreater(reaction_probs[0], 0.0)
        self.assertGreater(reaction_probs[3], 0.0)
        # It shouldn't go to tight (1) since no reaction -> tight in logs
        self.assertEqual(reaction_probs[1], 0.0)

if __name__ == "__main__":
    unittest.main()
