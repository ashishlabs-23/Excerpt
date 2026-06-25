import json
import argparse
import sys

class MatchImportanceEngine:
    def __init__(self):
        self.competition_weights = {
            "world_cup": 1.0,
            "champions_league": 0.95,
            "domestic_league": 0.80,
            "friendly": 0.30
        }
        
        self.stage_weights = {
            "final": 1.0,
            "semi_final": 0.90,
            "quarter_final": 0.80,
            "group_stage": 0.60,
            "regular_season": 0.50
        }

    def calculate_importance(self, match_info):
        competition = match_info.get("competition", "domestic_league").lower()
        stage = match_info.get("stage", "regular_season").lower()
        score_diff = abs(match_info.get("home_score", 0) - match_info.get("away_score", 0))
        time = match_info.get("time_minutes", 45.0)
        league_position_context = match_info.get("league_position_context", "mid_table").lower()

        # Base importance from competition & tournament stage
        comp_val = self.competition_weights.get(competition, 0.70)
        stage_val = self.stage_weights.get(stage, 0.50)
        
        base_importance = (comp_val * 0.6) + (stage_val * 0.4)

        # Context modifiers
        context_multiplier = 1.0
        if league_position_context == "title_decider":
            context_multiplier = 1.2
        elif league_position_context == "relegation_battle":
            context_multiplier = 1.1
        elif league_position_context == "top_4_race":
            context_multiplier = 1.05

        # Dynamic match tension based on time and score difference
        tension_multiplier = 1.0
        if time > 80.0:
            if score_diff == 0:
                tension_multiplier = 1.3  # Late draw
            elif score_diff == 1:
                tension_multiplier = 1.25 # Late one-goal lead
            else:
                tension_multiplier = 0.9  # Late blowout
        elif time > 60.0:
            if score_diff <= 1:
                tension_multiplier = 1.15
        
        final_score = base_importance * context_multiplier * tension_multiplier
        return min(1.0, max(0.1, round(final_score, 4)))

def main():
    parser = argparse.ArgumentParser(description="Match Importance Engine")
    parser.add_argument("--match-json", required=True, help="Path to match details JSON")
    parser.add_argument("--output-json", required=True, help="Path to write calculated importance JSON")
    args = parser.parse_args()

    try:
        with open(args.match_json, "r", encoding="utf-8") as f:
            match_info = json.load(f)

        engine = MatchImportanceEngine()
        importance = engine.calculate_importance(match_info)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"match_importance": importance}, f, indent=2)

        print(json.dumps({"status": "success", "match_importance": importance}))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
