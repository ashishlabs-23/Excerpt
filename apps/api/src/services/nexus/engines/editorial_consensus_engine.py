import json
import os

class EditorialConsensusEngine:
    def __init__(self):
        print("Initialized Editorial Consensus Engine")
        self.active_learning_queue_path = "consensus_active_learning_queue.json"
        self.queue = self._load_queue()

    def _load_queue(self):
        if os.path.exists(self.active_learning_queue_path):
            with open(self.active_learning_queue_path, 'r') as f:
                return json.load(f)
        return []

    def _save_queue(self):
        with open(self.active_learning_queue_path, 'w') as f:
            json.dump(self.queue, f, indent=2)

    def process_story_votes(self, story_id, votes):
        """
        Process multiple editor votes (e.g. ["A", "A", "B", "A"])
        Returns the consensus strength and adds highly ambiguous stories to the active learning queue.
        """
        if not votes:
            return None
            
        vote_counts = {}
        for v in votes:
            vote_counts[v] = vote_counts.get(v, 0) + 1
            
        total_votes = len(votes)
        max_votes = max(vote_counts.values())
        agreement_rate = max_votes / total_votes
        
        # Determine consensus strength
        if total_votes < 3:
            strength = "low_sample"
        elif agreement_rate >= 0.8:
            strength = "strong"
        elif agreement_rate >= 0.6:
            strength = "medium"
        else:
            strength = "weak"
            
        result = {
            "story_id": story_id,
            "total_votes": total_votes,
            "vote_distribution": vote_counts,
            "agreement_rate": round(agreement_rate, 2),
            "consensus_strength": strength
        }
        
        # If consensus is weak but we have a decent number of votes, this is highly valuable!
        if strength == "weak" and total_votes >= 4:
            self._queue_for_active_learning(result)
            
        return result
        
    def _queue_for_active_learning(self, result):
        # Add to queue if not already there
        if not any(item["story_id"] == result["story_id"] for item in self.queue):
            self.queue.append(result)
            self._save_queue()
            print(f"Added {result['story_id']} to Active Learning Queue (High Uncertainty Consensus).")

if __name__ == "__main__":
    engine = EditorialConsensusEngine()
    
    # Simulate a highly agreeable story
    res1 = engine.process_story_votes("story_001", ["A", "A", "A", "B"])
    print("\nProcessed Story 001:")
    print(json.dumps(res1, indent=2))
    
    # Simulate a highly ambiguous (valuable) story
    res2 = engine.process_story_votes("story_002", ["A", "B", "B", "A"])
    print("\nProcessed Story 002:")
    print(json.dumps(res2, indent=2))
    
    print("\nConsensus Active Learning Queue size:", len(engine.queue))
