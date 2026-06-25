import json
import os
from datetime import datetime

class EditorSimulationLeague:
    def __init__(self):
        print("Initialized Editor Simulation League")
        self.tracker_path = "editorial_elo_tracker.json"
        self.tracker = self._load_tracker()
        
    def _load_tracker(self):
        if os.path.exists(self.tracker_path):
            with open(self.tracker_path, 'r') as f:
                return json.load(f)
        return {"competitors": {}, "history": [], "matchups": []}

    def _save_tracker(self):
        with open(self.tracker_path, 'w') as f:
            json.dump(self.tracker, f, indent=2)

    def simulate_matchup(self, winner, loser):
        # K-factor
        K = 32
        R_winner = self.tracker["competitors"].get(winner, 1200)
        R_loser = self.tracker["competitors"].get(loser, 1200)
        
        E_winner = 1 / (1 + 10 ** ((R_loser - R_winner) / 400))
        E_loser = 1 / (1 + 10 ** ((R_winner - R_loser) / 400))
        
        R_winner_new = R_winner + K * (1 - E_winner)
        R_loser_new = R_loser + K * (0 - E_loser)
        
        self.tracker["competitors"][winner] = round(R_winner_new)
        self.tracker["competitors"][loser] = round(R_loser_new)
        
        matchup = {
            "timestamp": datetime.utcnow().isoformat(),
            "winner": winner,
            "loser": loser,
            "winner_elo_change": round(R_winner_new - R_winner),
            "loser_elo_change": round(R_loser_new - R_loser)
        }
        self.tracker["history"].append(matchup)
        self._save_tracker()
        
        print(f"Simulated: {winner} defeats {loser}")
        print(f"  {winner}: {R_winner} -> {round(R_winner_new)}")
        print(f"  {loser}: {R_loser} -> {round(R_loser_new)}")

if __name__ == "__main__":
    league = EditorSimulationLeague()
    
    # Simulate robust testing against distinct editorial philosophies
    league.simulate_matchup("current_production", "narrative_editor")
    league.simulate_matchup("viral_editor", "current_production") # Excerpt loses to Viral
    league.simulate_matchup("current_production", "broadcast_editor")
