import json
import random
from reaction_intelligence_engine import ReactionIntelligenceEngine

class StoryPreferenceModel:
    def __init__(self):
        self.reaction_engine = ReactionIntelligenceEngine()
        self.is_trained = False
        print("Initialized Story Preference Model v1")

    def extract_features(self, story_data, reaction_data):
        """
        Merge core event features with emotional reaction features
        to predict publishability.
        """
        return [
            story_data.get('tension', 0.5),
            story_data.get('commentary_hype', 0.5),
            story_data.get('scoreboard_importance', 0.5),
            reaction_data.get('combined_reaction_value', 0.5)
        ]

    def train(self, dataset):
        # Mock training phase
        self.is_trained = True
        print(f"Story Preference Model trained on {len(dataset)} examples.")

    def predict_publishability(self, story_data):
        if not self.is_trained:
            print("Warning: Model not trained.")
            
        reactions = self.reaction_engine.analyze_reaction(story_data)
        features = self.extract_features(story_data, reactions)
        
        # Publishability is heavily weighted towards reaction and tension
        tension = features[0]
        reaction = features[3]
        
        # Simple mocked probability
        base_prob = (tension * 0.4) + (reaction * 0.6)
        # Introduce slight variance to simulate model behavior
        publish_prob = min(0.99, base_prob * random.uniform(0.95, 1.05))
        
        return {
            "publish_probability": round(publish_prob, 2),
            "contributing_factors": {
                "tension": round(tension, 2),
                "reaction_quality": round(reaction, 2)
            }
        }

if __name__ == "__main__":
    model = StoryPreferenceModel()
    model.train([1] * 100) # Mock 100 samples
    
    event = {"event_type": "goal", "tension": 0.85, "commentary_hype": 0.9}
    prediction = model.predict_publishability(event)
    
    print("\nPublishability Prediction for Event:")
    print(json.dumps(prediction, indent=2))
