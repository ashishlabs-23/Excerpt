import json
import argparse
import sys

class FootballPatternEngine:
    def __init__(self):
        # High impact viral patterns with score boosts
        self.pattern_priors = {
            "late_game_winner": 0.35,      # 90th minute winners
            "penalty_shootout": 0.30,      # High tension spot kicks
            "goalkeeper_mistake": 0.25,    # High surprise factor
            "last_minute_equalizer": 0.30, # Match saver
            "red_card_drama": 0.20,        # Rivalry cards
            "counterattack_goal": 0.15     # Clean possession turn goal
        }

    def detect_patterns(self, match_context, event):
        boost = 0.0
        detected = []

        time = event.get("time_minutes", 45.0)
        event_type = event.get("event_type", "play").lower()
        score_diff = abs(event.get("home_score", 0) - event.get("away_score", 0))
        is_winning_goal = event.get("is_winning_goal", False)
        mistake = event.get("is_goalkeeper_mistake", False)
        is_penalty = event.get("is_penalty", False)

        # 1. Late Winner Pattern
        if event_type == "goal" and time > 85.0 and score_diff == 1 and is_winning_goal:
            boost += self.pattern_priors["late_game_winner"]
            detected.append("late_game_winner")
            
        # 2. Last Minute Equalizer
        if event_type == "goal" and time > 85.0 and score_diff == 0:
            boost += self.pattern_priors["last_minute_equalizer"]
            detected.append("last_minute_equalizer")

        # 3. Penalty shootout / spot kick
        if is_penalty:
            boost += self.pattern_priors["penalty_shootout"]
            detected.append("penalty_shootout")

        # 4. Goalkeeper Mistake
        if mistake:
            boost += self.pattern_priors["goalkeeper_mistake"]
            detected.append("goalkeeper_mistake")

        # 5. Red Card Drama
        if event_type == "red_card":
            boost += self.pattern_priors["red_card_drama"]
            detected.append("red_card_drama")

        # 6. Counterattack goal
        if event_type == "goal" and event.get("story_type") == "counterattack":
            boost += self.pattern_priors["counterattack_goal"]
            detected.append("counterattack_goal")

        return {
            "pattern_boost": round(boost, 4),
            "detected_patterns": detected
        }

def main():
    parser = argparse.ArgumentParser(description="Football Pattern Engine")
    parser.add_argument("--match-json", required=True, help="Path to match context JSON")
    parser.add_argument("--event-json", required=True, help="Path to event JSON")
    parser.add_argument("--output-json", required=True, help="Path to write pattern feedback JSON")
    args = parser.parse_args()

    try:
        with open(args.match_json, "r", encoding="utf-8") as f:
            match_context = json.load(f)
        with open(args.event_json, "r", encoding="utf-8") as f:
            event = json.load(f)

        engine = FootballPatternEngine()
        result = engine.detect_patterns(match_context, event)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps({
            "status": "success",
            "pattern_boost": result["pattern_boost"],
            "detected_patterns": result["detected_patterns"]
        }))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
