import json

class AnnotationRecommendationEngine:
    def __init__(self):
        print("Initialized Annotation Recommendation Engine")

    def calculate_roi(self, clip):
        # ROI = uncertainty * disagreement_frequency * archetype_rarity * coverage_gap
        uncertainty = clip.get('uncertainty', 0.5)
        disagreement_freq = clip.get('disagreement_frequency', 1.0) # Base multiplier
        archetype_rarity = clip.get('archetype_rarity', 1.0)
        coverage_gap = clip.get('coverage_gap', 1.0)
        
        roi = uncertainty * disagreement_freq * archetype_rarity * coverage_gap
        return roi

    def rank_queue(self, queue):
        for clip in queue:
            clip['roi'] = self.calculate_roi(clip)
            
        ranked = sorted(queue, key=lambda x: x['roi'], reverse=True)
        return ranked

if __name__ == "__main__":
    engine = AnnotationRecommendationEngine()
    
    mock_queue = [
        {
            "story_id": "story_common_01",
            "archetype": "late_game_winner",
            "uncertainty": 0.2,
            "disagreement_frequency": 1.1,
            "archetype_rarity": 0.5,
            "coverage_gap": 0.1
        },
        {
            "story_id": "story_rare_02",
            "archetype": "goalkeeper_heroics",
            "uncertainty": 0.8,
            "disagreement_frequency": 1.5,
            "archetype_rarity": 0.9,
            "coverage_gap": 0.9
        }
    ]
    
    ranked = engine.rank_queue(mock_queue)
    
    print("Ranked Annotation Priority Queue:")
    for idx, item in enumerate(ranked):
        print(f"{idx+1}. {item['story_id']} (Archetype: {item['archetype']}) | ROI Score: {item['roi']:.4f}")
