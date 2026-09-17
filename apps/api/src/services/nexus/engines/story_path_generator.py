import os
import sys
import json
import argparse

class StoryPathGenerator:
    def __init__(self):
        pass

    def generate_story_paths(self, graph):
        nodes = graph.get("nodes", [])
        
        # Build narrative variants
        variants = []
        story_types = ["counterattack", "player_focus", "crowd_emotion", "late_game_drama", "rivalry_drama"]

        for s_type in story_types:
            variants.append({
                "story_type": s_type,
                "nodes_covered": nodes,
                "crop_policy": "wide" if s_type == "counterattack" else "tight",
                "focus_element": "ball" if s_type in ["counterattack", "player_focus"] else "crowd"
            })

        return variants

def main():
    parser = argparse.ArgumentParser(description="Football Story Path & Narrative Planner")
    parser.add_argument("--graph-json", required=True, help="Path to narrative graph JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write story variants")
    args = parser.parse_args()

    try:
        with open(args.graph_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        graph = data.get("graph", {}) if "graph" in data else data
        generator = StoryPathGenerator()
        variants = generator.generate_story_paths(graph)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "variants": variants}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "variants": variants
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
