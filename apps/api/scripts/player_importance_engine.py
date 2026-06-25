import json
import argparse
import sys

class PlayerImportanceEngine:
    def __init__(self):
        # Database of star players and their fame scores
        self.star_players = {
            "messi": 1.0,
            "ronaldo": 1.0,
            "mbappe": 0.95,
            "bellingham": 0.90,
            "haaland": 0.90,
            "vinicius": 0.88,
            "salah": 0.85
        }

    def calculate_player_impact(self, event):
        player_name = event.get("player", "unknown").lower()
        role = event.get("role", "regular").lower()  # captain, mvp, top_scorer, regular
        event_type = event.get("event_type", "play").lower()
        time = event.get("time_minutes", 45.0)
        score_diff = abs(event.get("home_score", 0) - event.get("away_score", 0))
        is_winning_goal = event.get("is_winning_goal", False)
        
        # 1. Fame Score
        fame_score = self.star_players.get(player_name, 0.20)
        if role == "captain":
            fame_score = max(fame_score, 0.60)
        elif role == "top_scorer":
            fame_score = max(fame_score, 0.70)
        elif role == "mvp":
            fame_score = max(fame_score, 0.80)

        # 2. Match Influence Score (Dynamic)
        match_influence = 0.10
        if event_type == "goal":
            if time > 85.0 and score_diff == 0:
                match_influence = 1.0  # 90th minute draw-breaker
            elif is_winning_goal:
                match_influence = 0.85
            else:
                match_influence = 0.60
        elif event_type == "penalty_save":
            match_influence = 0.90
        elif event_type == "red_card":
            match_influence = 0.70
        elif event_type == "skill_move":
            match_influence = 0.40

        # Combine Fame and Influence: Star player + goal vs unknown player + late winner
        # If an unknown player scores a late winner, they get a high impact score.
        # If a star player scores a goal, they also get a very high impact score.
        impact_score = (fame_score * 0.4) + (match_influence * 0.6)
        
        return {
            "player": player_name,
            "fame_score": fame_score,
            "match_influence": match_influence,
            "player_impact_score": round(impact_score, 4)
        }

def main():
    parser = argparse.ArgumentParser(description="Player Importance Engine")
    parser.add_argument("--event-json", required=True, help="Path to event JSON containing player details")
    parser.add_argument("--output-json", required=True, help="Path to write calculated player impact JSON")
    args = parser.parse_args()

    try:
        with open(args.event_json, "r", encoding="utf-8") as f:
            event = json.load(f)

        engine = PlayerImportanceEngine()
        result = engine.calculate_player_impact(event)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps({"status": "success", "player_impact": result}))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
