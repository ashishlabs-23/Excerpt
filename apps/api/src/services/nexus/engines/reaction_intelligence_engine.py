import json
import random

class ReactionIntelligenceEngine:
    def __init__(self):
        print("Initialized Reaction Intelligence Engine (Feature Extractor)")

    def analyze_reaction(self, event_data):
        """
        Mock implementation of analyzing post-event frames for emotional payoff.
        In a real system, this would consume bounding boxes, audio amplitude,
        and pose estimations to score reaction intensity.
        """
        # We'll use the event_data tension to simulate reaction quality
        base_intensity = event_data.get('tension', 0.5)
        
        crowd = min(1.0, base_intensity * random.uniform(0.8, 1.2))
        bench = min(1.0, base_intensity * random.uniform(0.6, 1.1))
        player = min(1.0, base_intensity * random.uniform(0.9, 1.3))
        
        combined = (crowd * 0.4) + (player * 0.4) + (bench * 0.2)
        
        return {
            "crowd_reaction_score": round(crowd, 2),
            "bench_reaction_score": round(bench, 2),
            "player_reaction_score": round(player, 2),
            "combined_reaction_value": round(combined, 2)
        }

if __name__ == "__main__":
    engine = ReactionIntelligenceEngine()
    
    # Test on a high-tension event
    event = {"event_type": "goal", "tension": 0.95}
    reactions = engine.analyze_reaction(event)
    
    print("\nReaction Analysis for High-Tension Goal:")
    print(json.dumps(reactions, indent=2))
