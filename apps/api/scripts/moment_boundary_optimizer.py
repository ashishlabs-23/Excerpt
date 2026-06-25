import json
import argparse
import sys

class MomentBoundaryOptimizer:
    def __init__(self):
        pass

    def calculate_story_completeness(self, start, end, goal_time, story_start, reaction_end, hype_climb, hype_stabilize):
        """
        Calculates the Story Completeness Score based on:
        Build-up (25%), Trigger Action (25%), Goal (20%), Reaction (20%), Context (10%)
        """
        score = 0.0
        
        # Build-up (25%): Does the clip start at or before the possession chain start?
        if start <= story_start + 2.0:
            score += 0.25
        elif start <= story_start + 5.0:
            score += 0.15
            
        # Trigger Action (25%): Does it capture the hype climbing?
        if hype_climb and start <= hype_climb:
            score += 0.25
        elif start <= goal_time - 3.0:
            score += 0.15
            
        # Goal (20%): Does the clip span the goal?
        if start < goal_time < end:
            score += 0.20
            
        # Reaction (20%): Does it end after the celebration / hype stabilize?
        target_reaction_end = max(reaction_end, hype_stabilize) if hype_stabilize else reaction_end
        if end >= target_reaction_end - 2.0:
            score += 0.20
        elif end >= target_reaction_end - 5.0:
            score += 0.10
            
        # Context (10%): Does the clip have enough duration to breathe?
        if (end - start) >= 15.0:
            score += 0.10
            
        return round(score, 4)

    def optimize_boundaries(self, data):
        # Extract inputs from upstream engines
        goals = []
        if "football_events_results" in data:
            events = data["football_events_results"].get("results", [])
            goals = [e for e in events if e.get("event", "").lower() == "goal"]
            
        story_contexts = data.get("story_context_results", {}).get("contexts", [])
        reactions = data.get("reaction_ownership_results", {}).get("reactions", [])
        hype = data.get("commentary_hype_results", {}).get("hype", {})
        
        if not goals:
            return {"status": "no_goals_found"}
            
        hype_climb = hype.get("hype_climb_start")
        hype_stabilize = hype.get("hype_stabilize_end")
        
        optimized_candidates = []
        
        for goal in goals:
            goal_time = goal.get("start_time", 0)
            
            # Find matching context
            s_ctx = next((c for c in story_contexts if c.get("goal_time") == goal_time), None)
            r_ctx = next((r for r in reactions if r.get("goal_time") == goal_time), None)
            
            # Fallbacks
            story_start = s_ctx.get("story_start", goal_time - 10) if s_ctx else (goal_time - 10)
            reaction_end = r_ctx.get("reaction_end", goal_time + 10) if r_ctx else (goal_time + 10)
            
            # Narrative Boundary Logic:
            # start = min(possession_start, hype_climb_start)
            # end = max(reaction_end, hype_stabilize_end)
            
            best_start = story_start
            if hype_climb and hype_climb < goal_time:
                best_start = min(best_start, hype_climb)
                
            best_end = reaction_end
            if hype_stabilize and hype_stabilize > goal_time:
                best_end = max(best_end, hype_stabilize)
                
            # Score the ideal boundary
            score = self.calculate_story_completeness(
                best_start, best_end, goal_time, story_start, reaction_end, hype_climb, hype_stabilize
            )
            
            # Reject if below 0.8
            if score >= 0.8:
                optimized_candidates.append({
                    "start": round(best_start, 2),
                    "end": round(best_end, 2),
                    "duration": round(best_end - best_start, 2),
                    "story_completeness_score": score,
                    "possession_chain": s_ctx.get("possession_chain") if s_ctx else None,
                    "reaction_components": r_ctx.get("reaction_components") if r_ctx else None,
                    "optimizer_score": score
                })

        return {
            "status": "success",
            "optimized_candidates": optimized_candidates,
            "candidate_changed": True,
            "ranking_changed": False,
            "render_changed": False,
            "output_consumed": True
        }

def main():
    parser = argparse.ArgumentParser(description="Moment Boundary Optimizer")
    parser.add_argument("--policy-json", required=True, help="Payload JSON containing all engine results")
    parser.add_argument("--output-json", required=True, help="Path to write optimized boundaries JSON")
    args = parser.parse_args()

    try:
        with open(args.policy_json, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        optimizer = MomentBoundaryOptimizer()
        result = optimizer.optimize_boundaries(data)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
