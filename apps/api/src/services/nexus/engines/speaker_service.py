import os
import sys
import json
import argparse

def map_words_to_speakers(words, diarization_segments):
    """
    Maps each word to a normalized speaker (A, B, C...) based on temporal overlap.
    Falls back to the closest speaker segment if there is no direct overlap.
    """
    # Normalize speaker names to A, B, C...
    unique_speakers = sorted(list(set(s["speaker"] for s in diarization_segments)))
    speaker_map = {}
    for idx, spk in enumerate(unique_speakers):
        label = chr(65 + idx) if idx < 26 else f"SPK_{idx}"
        speaker_map[spk] = label

    mapped_words = []
    for w in words:
        w_start = w.get("start", 0.0)
        w_end = w.get("end", w_start + 0.1)
        best_speaker = None
        max_overlap = 0.0

        for s in diarization_segments:
            s_start = s["start"]
            s_end = s["end"]
            overlap = max(0.0, min(w_end, s_end) - max(w_start, s_start))
            if overlap > max_overlap:
                max_overlap = overlap
                best_speaker = s["speaker"]

        # Fallback to closest segment if no overlap (silence/gap)
        if best_speaker is None and diarization_segments:
            min_dist = float("inf")
            for s in diarization_segments:
                s_start = s["start"]
                s_end = s["end"]
                if w_start > s_end:
                    dist = w_start - s_end
                elif s_start > w_end:
                    dist = s_start - w_end
                else:
                    dist = 0.0
                if dist < min_dist:
                    min_dist = dist
                    best_speaker = s["speaker"]

        speaker_label = speaker_map.get(best_speaker, "A") if best_speaker else "A"
        
        mapped_words.append({
            "word": w.get("word", ""),
            "start": round(w_start, 3),
            "end": round(w_end, 3),
            "speaker": speaker_label
        })
        
    return mapped_words, speaker_map

def build_active_speaker_timeline(mapped_words, min_segment_duration=0.3, max_merge_gap=1.5):
    """
    Groups consecutive words belonging to the same speaker into an active speaker timeline.
    Filters out jittery segments shorter than min_segment_duration.
    """
    if not mapped_words:
        return []

    timeline = []
    current_segment = {
        "speaker": mapped_words[0]["speaker"],
        "start": mapped_words[0]["start"],
        "end": mapped_words[0]["end"]
    }

    for w in mapped_words[1:]:
        # Merge if same speaker and the gap between words is below the threshold
        if w["speaker"] == current_segment["speaker"] and w["start"] - current_segment["end"] < max_merge_gap:
            current_segment["end"] = w["end"]
        else:
            # Close previous segment if it meets the minimum duration constraint
            if round(current_segment["end"] - current_segment["start"], 3) >= min_segment_duration:
                timeline.append({
                    "speaker": current_segment["speaker"],
                    "start": round(current_segment["start"], 2),
                    "end": round(current_segment["end"], 2)
                })
            current_segment = {
                "speaker": w["speaker"],
                "start": w["start"],
                "end": w["end"]
            }

    # Append the last segment
    if round(current_segment["end"] - current_segment["start"], 3) >= min_segment_duration:
        timeline.append({
            "speaker": current_segment["speaker"],
            "start": round(current_segment["start"], 2),
            "end": round(current_segment["end"], 2)
        })
        
    return timeline

def main():
    parser = argparse.ArgumentParser(description="WhisperX & Pyannote Speaker Diarization Combiner")
    parser.add_argument("--diarization-json", help="Path to Pyannote diarization results JSON")
    parser.add_argument("--words-json", help="Path to WhisperX word timestamps JSON")
    parser.add_argument("--input-json", help="Path to a single JSON containing both diarization and words keys")
    parser.add_argument("--output", required=True, help="Path to save timeline output JSON")
    parser.add_argument("--min-dur", type=float, default=0.3, help="Minimum active speaker segment duration")
    args = parser.parse_args()

    try:
        diarization = []
        words = []

        if args.input_json:
            with open(args.input_json, "r", encoding="utf-8") as f:
                data = json.load(f)
                diarization = data.get("diarization", [])
                words = data.get("words", [])
        else:
            if not args.diarization_json or not args.words_json:
                raise ValueError("Must provide either --input-json or both --diarization-json and --words-json")
            
            with open(args.diarization_json, "r", encoding="utf-8") as f:
                diarization = json.load(f)
            with open(args.words_json, "r", encoding="utf-8") as f:
                w_data = json.load(f)
                words = w_data if isinstance(w_data, list) else w_data.get("words", [])

        # Ensure correct formats
        if isinstance(diarization, dict):
            diarization = diarization.get("segments", [])

        mapped_words, speaker_map = map_words_to_speakers(words, diarization)
        timeline = build_active_speaker_timeline(mapped_words, min_segment_duration=args.min_dur)

        output_data = {
            "status": "success",
            "speaker_mapping": speaker_map,
            "timeline": timeline,
            "words": mapped_words
        }

        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2)

        # Print final timeline elements on stdout
        print(json.dumps({
            "status": "success",
            "output_file": args.output,
            "timeline": timeline
        }))

    except Exception as e:
        print(json.dumps({
            "status": "failed",
            "error": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
