import json
import argparse
import sys
import os

class RetentionPredictorV3:
    def __init__(self, outcomes_db_path=None):
        self.outcomes_db_path = outcomes_db_path
        self.history = {}
        if outcomes_db_path and os.path.exists(outcomes_db_path):
            self.load_outcomes(outcomes_db_path)

    def load_outcomes(self, path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                self.history = json.load(f)
        except:
            self.history = {}

    def predict_retention(self, candidate_variant):
        # 1. Base prediction from features
        hook = candidate_variant.get("hook_quality", 0.50)
        commentary = candidate_variant.get("commentary_hype", 0.50)
        motion = candidate_variant.get("motion_intensity", 0.50)
        story_tension = candidate_variant.get("tension", 0.50)
        
        predicted_retention = (hook * 0.35) + (commentary * 0.25) + (motion * 0.20) + (story_tension * 0.20)

        # 2. Historical outcome calibration (priors)
        # Search history for similar edits
        story_type = candidate_variant.get("story_type", "counterattack")
        editor_style = candidate_variant.get("editor_style", "broadcaster")
        
        matches = []
        for clip_id, outcome in self.history.items():
            if outcome.get("story_type") == story_type and outcome.get("editor_style") == editor_style:
                matches.append(outcome.get("observed_retention", 0.70))
                
        if matches:
            # Shift predicted retention towards actual observed retention
            avg_observed = sum(matches) / len(matches)
            predicted_retention = (predicted_retention * 0.4) + (avg_observed * 0.6)

        return round(float(predicted_retention), 4)

def main():
    parser = argparse.ArgumentParser(description="Retention Predictor V3")
    parser.add_argument("--candidate-json", required=True, help="Path to candidate variant JSON")
    parser.add_argument("--outcomes-json", help="Path to historical outcomes database JSON")
    parser.add_argument("--output-json", required=True, help="Path to write predicted retention JSON")
    args = parser.parse_args()

    try:
        with open(args.candidate_json, "r", encoding="utf-8") as f:
            candidate = json.load(f)

        predictor = RetentionPredictorV3(outcomes_db_path=args.outcomes_json)
        score = predictor.predict_retention(candidate)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"predicted_retention": score}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "predicted_retention": score
        }))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
