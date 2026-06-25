import os
import sys
import json
import argparse
import numpy as np

class EditorEmulationEngine:
    def __init__(self, broadcaster="fifa"):
        self.broadcaster = broadcaster.lower()
        
        # Default camera transition probability matrix:
        # States: 0: Wide, 1: Tight, 2: Reaction/Celebration, 3: Replay
        self.transition_matrix = {
            "fifa": np.array([
                [0.70, 0.15, 0.10, 0.05], # From Wide
                [0.40, 0.40, 0.15, 0.05], # From Tight
                [0.50, 0.10, 0.30, 0.10], # From Reaction
                [0.80, 0.10, 0.10, 0.00]  # From Replay
            ]),
            "premier_league": np.array([
                [0.65, 0.20, 0.10, 0.05],
                [0.35, 0.45, 0.15, 0.05],
                [0.40, 0.10, 0.40, 0.10],
                [0.75, 0.15, 0.10, 0.00]
            ]),
            "nba": np.array([
                [0.40, 0.50, 0.05, 0.05], # NBA uses much more Tight tracks
                [0.30, 0.60, 0.08, 0.02],
                [0.50, 0.20, 0.25, 0.05],
                [0.80, 0.10, 0.10, 0.00]
            ]),
            "ufc": np.array([
                [0.30, 0.60, 0.05, 0.05], # UFC focuses tightly on fighters
                [0.20, 0.70, 0.05, 0.05],
                [0.30, 0.20, 0.45, 0.05],
                [0.70, 0.20, 0.10, 0.00]
            ]),
            "espn": np.array([
                [0.55, 0.30, 0.10, 0.05],
                [0.30, 0.50, 0.15, 0.05],
                [0.40, 0.15, 0.35, 0.10],
                [0.70, 0.15, 0.15, 0.00]
            ])
        }

        # Active transition matrix
        self.matrix = self.transition_matrix.get(self.broadcaster, self.transition_matrix["espn"])
        self.state_names = ["Wide", "Tight", "Reaction", "Replay"]
        self.current_state_idx = 0  # Start at Wide view

    def train_from_logs(self, broadcast_logs):
        """
        Training pipeline: fits the state transition matrix based on historical editing log sequences.
        """
        # Initialize counts
        counts = np.zeros((4, 4))
        state_map = {"wide": 0, "tight": 1, "reaction": 2, "celebration": 2, "replay": 3}
        
        for log in broadcast_logs:
            sequence = log.get("sequence", [])
            for i in range(len(sequence) - 1):
                s_from = state_map.get(sequence[i].lower(), 0)
                s_to = state_map.get(sequence[i+1].lower(), 0)
                counts[s_from, s_to] += 1
                
        # Normalize to form probabilities
        for r in range(4):
            row_sum = np.sum(counts[r])
            if row_sum > 0:
                self.matrix[r] = counts[r] / row_sum
            else:
                # Keep default if no training data for state
                pass

    def recommend_decisions(self, timeline):
        """
        Recommends camera cuts, transitions, zooms, and replay placements over timeline segments.
        """
        decisions = []
        last_climax_timestamp = None
        
        for idx, segment in enumerate(timeline):
            timestamp = segment.get("timestamp", 0.0)
            events = segment.get("events", [])
            stage = segment.get("stage", "Setup")
            intensity = segment.get("intensity", 0.3)
            
            # 1. State transitions based on rules and matrix probabilities
            next_state_idx = self.current_state_idx
            transition_type = "hard_cut"
            zoom_factor = 1.0
            rationale = "Maintain active broadcast perspective"
            
            # Track climax for replay source
            if stage == "Climax" or any(e in ["goal", "dunk", "three_pointer"] for e in events):
                last_climax_timestamp = timestamp
            
            # Overriding heuristics mimicking director decisions:
            if stage == "Climax" or any(e in ["goal", "dunk", "three_pointer"] for e in events):
                # Cut to Tight or Reaction instantly
                next_state_idx = 1 # Tight focus on goal/dunk
                zoom_factor = 1.5 if self.broadcaster in ["fifa", "espn"] else 1.8
                transition_type = "hard_cut"
                rationale = "Instant cut to tight shot for climax event"
            elif stage == "Payoff" or any(e in ["celebration", "crowd_reaction"] for e in events):
                # Transition to reaction/celebration
                next_state_idx = 2 # Reaction view
                zoom_factor = 1.6
                transition_type = "crossfade" if self.broadcaster in ["fifa", "premier_league"] else "hard_cut"
                rationale = "Transition to reaction and fan celebration close-ups"
            else:
                # Sample state from active Markov transition matrix
                probs = self.matrix[self.current_state_idx]
                next_state_idx = int(np.random.choice([0, 1, 2, 3], p=probs))
                
                if next_state_idx == 0:
                    zoom_factor = 1.0
                    rationale = "Revert to wide broadcast overview"
                elif next_state_idx == 1:
                    zoom_factor = 1.3
                    rationale = "Slight zoom on active play action area"
                elif next_state_idx == 2:
                    zoom_factor = 1.5
                    rationale = "Cut to close-up of active players"
                elif next_state_idx == 3:
                    zoom_factor = 1.4
                    rationale = "Focus on highlight action sequence"

            # Replay placement recommendation
            # Insert replay during payoff stage if we have a recent climax
            replay_recommended = False
            replay_source = None
            if stage == "Payoff" and last_climax_timestamp is not None:
                # If we haven't recommended a replay recently
                if not any(d.get("replay_placement") for d in decisions[-3:]):
                    replay_recommended = True
                    replay_source = last_climax_timestamp
                    transition_type = "whip_pan" if self.broadcaster == "ufc" else "crossfade"
                    rationale = f"Slow-motion replay insertion of climax at {last_climax_timestamp}s"
                    last_climax_timestamp = None # Reset
            
            self.current_state_idx = next_state_idx
            
            decisions.append({
                "timestamp": round(float(timestamp), 2),
                "camera_state": self.state_names[next_state_idx],
                "action": "cut" if next_state_idx != self.current_state_idx else "hold",
                "transition": transition_type,
                "zoom_factor": round(float(zoom_factor), 2),
                "replay_placement": replay_recommended,
                "replay_source": replay_source,
                "rationale": rationale
            })

        return decisions

def main():
    parser = argparse.ArgumentParser(description="Editor Emulation Engine")
    parser.add_argument("--input-json", required=True, help="Path to input segments/timeline JSON")
    parser.add_argument("--output-json", required=True, help="Path to write editing decisions JSON")
    parser.add_argument("--broadcaster", default="espn", choices=["fifa", "premier_league", "nba", "ufc", "espn"], help="Broadcast editing profile style")
    parser.add_argument("--train-logs", help="Path to broadcast sequences training JSON log file")
    args = parser.parse_args()

    try:
        with open(args.input_json, "r", encoding="utf-8") as f:
            timeline_data = json.load(f)
            
        timeline = timeline_data.get("results", []) if isinstance(timeline_data, dict) else timeline_data
        
        engine = EditorEmulationEngine(broadcaster=args.broadcaster)
        
        # Optional training pipeline
        if args.train_logs and os.path.exists(args.train_logs):
            with open(args.train_logs, "r", encoding="utf-8") as f:
                logs = json.load(f)
            engine.train_from_logs(logs)
            
        decisions = engine.recommend_decisions(timeline)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump({"broadcaster": args.broadcaster, "decisions": decisions}, f, indent=2)

        print(json.dumps({
            "status": "success",
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
