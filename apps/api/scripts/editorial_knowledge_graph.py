import json
import os

class EditorialKnowledgeGraph:
    def __init__(self, db_path="knowledge_graph.json"):
        self.db_path = db_path
        self.graph = self._load_graph()
        print("Initialized Editorial Knowledge Graph (Storage Mode Only)")

    def _load_graph(self):
        if os.path.exists(self.db_path):
            with open(self.db_path, 'r') as f:
                return json.load(f)
        return {"nodes": [], "edges": []}

    def _save_graph(self):
        with open(self.db_path, 'w') as f:
            json.dump(self.graph, f, indent=2)

    def add_node(self, node_id, node_type, description=""):
        if not any(n["id"] == node_id for n in self.graph["nodes"]):
            self.graph["nodes"].append({
                "id": node_id,
                "type": node_type,
                "description": description
            })
            self._save_graph()

    def add_edge(self, source, target, weight):
        """
        Stores an associative link between two editorial concepts.
        """
        # Overwrite existing edge if it exists
        self.graph["edges"] = [e for e in self.graph["edges"] if not (e["source"] == source and e["target"] == target)]
        
        self.graph["edges"].append({
            "source": source,
            "target": target,
            "weight": round(weight, 2)
        })
        self._save_graph()

if __name__ == "__main__":
    kg = EditorialKnowledgeGraph("test_kg.json")
    
    # Setup Nodes
    kg.add_node("late_game_winner", "archetype", "A goal scored in the final minutes to take the lead")
    kg.add_node("crowd_eruption", "reaction", "High intensity positive crowd audio and visual")
    kg.add_node("bench_explosion", "reaction", "Coaching staff and substitutes celebrating")
    kg.add_node("90_plus_minute", "time_factor", "Occurs in stoppage time")
    
    # Store explicit correlations learned from the tournament dataset
    kg.add_edge("late_game_winner", "crowd_eruption", 0.91)
    kg.add_edge("late_game_winner", "bench_explosion", 0.85)
    kg.add_edge("late_game_winner", "90_plus_minute", 0.99)
    
    print("\nKnowledge Graph Seeded:")
    print(json.dumps(kg.graph, indent=2))
