import os
import sys
import json
import argparse

class FootballNarrativeGraph:
    def __init__(self):
        pass

    def build_graph(self, event_sequence):
        nodes = []
        edges = []

        for idx, event in enumerate(event_sequence):
            ev_name = event.get("event", "BuildUp")
            
            # De-duplicate node sequence additions
            if not nodes or nodes[-1] != ev_name:
                nodes.append(ev_name)
                if len(nodes) > 1:
                    edges.append([nodes[-2], nodes[-1]])

        return {
            "nodes": nodes,
            "edges": edges,
            "path_string": " -> ".join(nodes)
        }

def main():
    parser = argparse.ArgumentParser(description="Football Narrative Graph Builder")
    parser.add_argument("--events-json", required=True, help="Path to events classification JSON file")
    parser.add_argument("--output-json", required=True, help="Path to write the narrative graph")
    args = parser.parse_args()

    try:
        with open(args.events_json, "r", encoding="utf-8") as f:
            data = json.load(f)

        events = data.get("results", []) if isinstance(data, dict) else data
        builder = FootballNarrativeGraph()
        result = builder.build_graph(events)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"status": "success", "graph": result}, f, indent=2)

        print(json.dumps({
            "status": "success",
            "graph": result
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
