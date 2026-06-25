import json
import argparse
import sys

class EditorPersonaEngine:
    def __init__(self):
        # 5 Virtual Editor Styles and their parameter preferences
        self.personas = {
            "tiktok": {
                "name": "TikTok Editor",
                "max_duration": 15.0,
                "min_duration": 5.0,
                "preferred_zoom": "tight",
                "preferred_focus": "player",
                "motion_bias": 1.3,
                "hook_bias": 1.5,
                "pacing": "fast",
                "commentary_hype_bias": 1.2
            },
            "analyst": {
                "name": "Football Analyst",
                "max_duration": 45.0,
                "min_duration": 20.0,
                "preferred_zoom": "wide",
                "preferred_focus": "tactical",
                "motion_bias": 0.8,
                "hook_bias": 0.6,
                "pacing": "slow",
                "commentary_hype_bias": 0.8
            },
            "broadcaster": {
                "name": "Broadcaster",
                "max_duration": 30.0,
                "min_duration": 15.0,
                "preferred_zoom": "normal",
                "preferred_focus": "story",
                "motion_bias": 1.0,
                "hook_bias": 1.0,
                "pacing": "medium",
                "commentary_hype_bias": 1.0
            },
            "highlight_channel": {
                "name": "Highlight Channel",
                "max_duration": 25.0,
                "min_duration": 10.0,
                "preferred_zoom": "medium",
                "preferred_focus": "goal",
                "motion_bias": 1.1,
                "hook_bias": 1.2,
                "pacing": "medium",
                "commentary_hype_bias": 1.1
            },
            "retention_maximizer": {
                "name": "Retention Maximizer",
                "max_duration": 20.0,
                "min_duration": 8.0,
                "preferred_zoom": "tight",
                "preferred_focus": "celebration",
                "motion_bias": 1.2,
                "hook_bias": 1.4,
                "pacing": "fast",
                "commentary_hype_bias": 1.3
            }
        }

    def apply_persona(self, variant, persona_name):
        persona = self.personas.get(persona_name.lower(), self.personas["broadcaster"])
        
        # Modify copy of variant parameters to emulate the persona's taste
        emulated = dict(variant)
        emulated["editor_style"] = persona_name.lower()
        
        # Adjust start and end times based on persona duration preferences
        original_duration = emulated.get("duration", emulated.get("end", 10.0) - emulated.get("start", 0.0))
        target_duration = max(persona["min_duration"], min(persona["max_duration"], original_duration))
        
        # Adjust duration centered around the event trigger or shift boundary
        center = emulated.get("start", 0.0) + original_duration / 2.0
        emulated["start"] = max(0.0, round(center - target_duration / 2.0, 1))
        emulated["end"] = round(emulated["start"] + target_duration, 1)
        emulated["duration"] = target_duration
        
        # Apply style factors
        emulated["focus"] = persona["preferred_focus"]
        emulated["zoom"] = persona["preferred_zoom"]
        emulated["pacing"] = persona["pacing"]
        
        # Scale intermediate scores based on editor biases
        emulated["retention_prediction"] = min(1.0, emulated.get("retention_prediction", 0.7) * persona["motion_bias"])
        emulated["hook_quality"] = min(1.0, emulated.get("hook_quality", 0.7) * persona["hook_bias"])
        emulated["commentary_hype"] = min(1.0, emulated.get("commentary_hype", 0.7) * persona["commentary_hype_bias"])
        
        return emulated

def main():
    parser = argparse.ArgumentParser(description="Editor Persona Engine")
    parser.add_argument("--variant-json", required=True, help="Path to input variant JSON")
    parser.add_argument("--persona", default="broadcaster", help="Editor persona name")
    parser.add_argument("--output-json", required=True, help="Path to output variant JSON")
    args = parser.parse_args()

    try:
        with open(args.variant_json, "r", encoding="utf-8") as f:
            variant = json.load(f)
            
        engine = EditorPersonaEngine()
        result = engine.apply_persona(variant, args.persona)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)

        print(json.dumps({"status": "success", "variant": result}))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
