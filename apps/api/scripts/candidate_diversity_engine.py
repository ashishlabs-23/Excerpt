import json
import argparse
import sys

class CandidateDiversityEngine:
    def __init__(self, similarity_threshold=0.85):
        self.similarity_threshold = similarity_threshold

    def calculate_similarity(self, clip_a, clip_b):
        # 1. Boundary Overlap (Intersection over Union of start/end times)
        start_a, end_a = clip_a.get("start", 0.0), clip_a.get("end", 10.0)
        start_b, end_b = clip_b.get("start", 0.0), clip_b.get("end", 10.0)

        intersection = max(0.0, min(end_a, end_b) - max(start_a, start_b))
        union = (end_a - start_a) + (end_b - start_b) - intersection

        boundary_similarity = (intersection / union) if union > 0 else 0.0

        # 2. Focus and Zoom match
        focus_match = 1.0 if clip_a.get("focus") == clip_b.get("focus") else 0.0
        zoom_match = 1.0 if clip_a.get("zoom") == clip_b.get("zoom") else 0.0
        story_match = 1.0 if clip_a.get("story_type") == clip_b.get("story_type") else 0.0

        # Combined similarity score
        # 50% boundary overlap + 20% story path + 15% focus + 15% zoom
        total_similarity = (
            (boundary_similarity * 0.50) +
            (story_match * 0.20) +
            (focus_match * 0.15) +
            (zoom_match * 0.15)
        )
        return total_similarity

    def filter_candidates(self, candidates):
        # Candidates must be dictionaries with a "score" and "variant" metadata.
        # Sort by score descending to keep the highest quality versions.
        sorted_candidates = sorted(candidates, key=lambda x: x.get("score", 0.0), reverse=True)
        filtered = []

        for candidate in sorted_candidates:
            keep = True
            for accepted in filtered:
                sim = self.calculate_similarity(candidate.get("variant", candidate), accepted.get("variant", accepted))
                if sim > self.similarity_threshold:
                    keep = False
                    break
            if keep:
                filtered.append(candidate)
        return filtered

def main():
    parser = argparse.ArgumentParser(description="Candidate Diversity Engine")
    parser.add_argument("--candidates-json", required=True, help="Path to candidates JSON list")
    parser.add_argument("--output-json", required=True, help="Path to write filtered candidates JSON")
    args = parser.parse_args()

    try:
        with open(args.candidates_json, "r", encoding="utf-8") as f:
            candidates = json.load(f)

        engine = CandidateDiversityEngine()
        filtered = engine.filter_candidates(candidates)

        with open(args.output_json, "w", encoding="utf-8") as f:
            json.dump(filtered, f, indent=2)

        print(json.dumps({
            "status": "success",
            "original_count": len(candidates),
            "filtered_count": len(filtered)
        }))
    except Exception as e:
        print(json.dumps({"status": "failed", "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
