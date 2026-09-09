import os
import sys
import json
import argparse
import numpy as np

class ExcerptArena:
    def __init__(self, k_factor=32):
        self.k_factor = k_factor
        self.ratings = {
            "baseline": 1000.0,
            "draft": 1000.0,
            "quality": 1000.0,
            "opus": 1000.0
        }
        self.scores = {k: [] for k in self.ratings}
        self.times = {k: [] for k in self.ratings}
        self.costs = {k: [] for k in self.ratings}
        self.qpms = {k: [] for k in self.ratings}

    def compute_expected_score(self, rating_a, rating_b):
        """
        Calculates expected outcome of Player A in a matchup against Player B using Elo logic.
        """
        return 1.0 / (1.0 + 10.0 ** ((rating_b - rating_a) / 400.0))

    def update_ratings(self, variant_a, variant_b, outcome_a):
        """
        Updates Elo ratings for both variants based on matchup results.
        outcome_a: 1.0 if A wins, 0.0 if B wins, 0.5 for draw.
        """
        r_a = self.ratings[variant_a]
        r_b = self.ratings[variant_b]

        expected_a = self.compute_expected_score(r_a, r_b)
        expected_b = 1.0 - expected_a
        outcome_b = 1.0 - outcome_a

        self.ratings[variant_a] = round(r_a + self.k_factor * (outcome_a - expected_a), 2)
        self.ratings[variant_b] = round(r_b + self.k_factor * (outcome_b - expected_b), 2)

    def evaluate_variant(self, variant_name, mock_clip):
        """
        Simulates Multi-Critic scoring.
        """
        crops_score = mock_clip.get("crops_score", 50.0)
        captions_score = mock_clip.get("captions_score", 50.0)
        story_score = mock_clip.get("story_score", 50.0)
        retention_score = mock_clip.get("retention_score", 50.0)

        # Average score
        avg_score = (crops_score + captions_score + story_score + retention_score) / 4.0
        
        # Track time, cost, QPM
        gen_time = mock_clip.get("generation_time", 60.0)  # default 60s
        cost = mock_clip.get("cost", 0.05)  # default $0.05
        qpm = avg_score / (gen_time / 60.0) if gen_time > 0 else 0.0

        self.scores[variant_name].append(avg_score)
        self.times[variant_name].append(gen_time)
        self.costs[variant_name].append(cost)
        self.qpms[variant_name].append(qpm)

        return avg_score

    def run_matchups(self, datasets):
        """
        Executes a round-robin simulated tournament over multiple video datasets.
        """
        variants = ["baseline", "draft", "quality", "opus"]
        for item in datasets:
            clip_base = item.get("baseline") or {}
            clip_draft = item.get("draft") or item.get("heuristic") or {}
            clip_quality = item.get("quality") or item.get("orchestrated") or {}
            clip_opus = item.get("opus") or {}

            self.evaluate_variant("baseline", clip_base)
            self.evaluate_variant("draft", clip_draft)
            self.evaluate_variant("quality", clip_quality)
            self.evaluate_variant("opus", clip_opus)

            # Round-robin matches
            for i in range(len(variants)):
                for j in range(i + 1, len(variants)):
                    v1, v2 = variants[i], variants[j]
                    score_1 = self.scores[v1][-1]
                    score_2 = self.scores[v2][-1]
                    
                    gap = score_1 - score_2
                    prob_win_1 = 1.0 / (1.0 + np.exp(-gap / 10.0))
                    outcome_1 = 1.0 if np.random.random() < prob_win_1 else 0.0
                    
                    self.update_ratings(v1, v2, outcome_1)

    def generate_report(self):
        """
        Generates final comparison analytics summary.
        """
        report = {
            "ratings": self.ratings,
            "averages": {k: round(float(np.mean(v)), 2) if v else 0.0 for k, v in self.scores.items()},
            "generation_time_avg": {k: round(float(np.mean(v)), 2) if v else 0.0 for k, v in self.times.items()},
            "generation_cost_avg": {k: round(float(np.mean(v)), 4) if v else 0.0 for k, v in self.costs.items()},
            "qpm_avg": {k: round(float(np.mean(v)), 2) if v else 0.0 for k, v in self.qpms.items()},
            "recommendations": []
        }
        
        best_rating = max(self.ratings, key=self.ratings.get)
        if best_rating == "quality":
            report["recommendations"].append("Excerpt Quality mode outperforms competitors in Elo rating. Recommended production target.")
        elif best_rating == "opus":
            report["recommendations"].append("Competitor Opus outperforms Excerpt Quality. Focus on hyperparameter optimization.")
        else:
            report["recommendations"].append("Simulated results indicate alternate best variant: " + best_rating)
            
        return report

def main():
    parser = argparse.ArgumentParser(description="Excerpt Quality Arena Tournament Suite")
    parser.add_argument("--input-json", required=True, help="Path to input mock tournament datasets JSON")
    parser.add_argument("--output-json", required=True, help="Path to write arena statistics JSON")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        datasets = data.get("results", []) if isinstance(data, dict) else data
        
        arena = ExcerptArena()
        arena.run_matchups(datasets)
        report = arena.generate_report()

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        print(json.dumps({
            "status": "success",
            "winner": max(report["ratings"], key=report["ratings"].get),
            "ratings": report["ratings"],
            "qpm": report["qpm_avg"],
            "output_file": args.output_json
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
