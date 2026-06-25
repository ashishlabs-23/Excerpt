import json
import os
from datetime import datetime

class EditorialMemoryEngine:
    def __init__(self, memory_file="editorial_memory.json"):
        self.memory_file = memory_file
        self.memory = self._load_memory()
        print("Initialized Editorial Memory Engine v2 (Promotion Gating)")

    def _load_memory(self):
        if os.path.exists(self.memory_file):
            with open(self.memory_file, 'r') as f:
                return json.load(f)
        return {}

    def _save_memory(self):
        with open(self.memory_file, 'w') as f:
            json.dump(self.memory, f, indent=2)

    def _calculate_promotion_status(self, record):
        """
        Gating mechanism to prevent statistical noise from affecting production ranking.
        """
        samples = record["sample_count"]
        win_rate = record["editor_win_rate"]
        stability = record.get("stability", 0.0)

        # Baseline stability required for upper tiers
        if samples >= 100 and win_rate >= 0.80 and stability > 0.85:
            return "production_prior"
        elif samples >= 50 and win_rate >= 0.75 and stability > 0.70:
            return "verified"
        elif samples >= 20 and win_rate >= 0.65:
            return "candidate"
        elif samples >= 5:
            return "observed"
        
        return "unverified"

    def learn_pattern(self, pattern_id, story_archetype, reaction_profile, scoreboard_context, editor_selected, confidence_score=0.9):
        """
        Updates the win rate for a specific editorial pattern, updating promotion states.
        """
        if pattern_id not in self.memory:
            self.memory[pattern_id] = {
                "pattern_id": pattern_id,
                "story_archetype": story_archetype,
                "reaction_profile": reaction_profile,
                "scoreboard_context": scoreboard_context,
                "editor_win_rate": 0.0,
                "sample_count": 0,
                "wins": 0,
                "confidence": confidence_score,
                "stability": 1.0,
                "last_seen": datetime.utcnow().isoformat(),
                "promotion_status": "unverified"
            }
            
        record = self.memory[pattern_id]
        record["sample_count"] += 1
        if editor_selected:
            record["wins"] += 1
            
        # Update core metrics
        new_win_rate = record["wins"] / record["sample_count"]
        
        # Simple stability proxy: how much did the win rate change?
        if record["sample_count"] > 1:
            diff = abs(record["editor_win_rate"] - new_win_rate)
            record["stability"] = max(0.0, 1.0 - (diff * 2.0))
            
        record["editor_win_rate"] = new_win_rate
        record["confidence"] = (record["confidence"] * 0.9) + (confidence_score * 0.1)
        record["last_seen"] = datetime.utcnow().isoformat()
        
        # Graduate status
        record["promotion_status"] = self._calculate_promotion_status(record)
        
        self._save_memory()

    def get_production_prior(self, pattern_id):
        """
        Retrieves the historical win rate ONLY if the pattern has graduated to production.
        """
        record = self.memory.get(pattern_id)
        if record and record["promotion_status"] == "production_prior":
            return record["editor_win_rate"]
        return None

if __name__ == "__main__":
    # Test Promotion Ladder
    engine = EditorialMemoryEngine("test_memory_promotion.json")
    
    # Simulate learning from 110 editor choices to force promotion
    for i in range(110):
        editor_selected = (i % 10 != 0) # 90% win rate
        engine.learn_pattern(
            pattern_id="late_game_winner_crowd_eruption",
            story_archetype="late_game_winner",
            reaction_profile={"crowd": 0.95, "bench": 0.8, "player": 0.9},
            scoreboard_context={"minute": 90, "score_diff": 1},
            editor_selected=editor_selected,
            confidence_score=0.95
        )
        
    print(f"Memory saved. End Status:")
    print(json.dumps(engine.memory["late_game_winner_crowd_eruption"], indent=2))
