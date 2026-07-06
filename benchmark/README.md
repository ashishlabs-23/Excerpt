# Excerpt Clip Quality Benchmark Dataset

This dataset acts as the absolute ground truth for measuring improvements in the AI clipping engine. 
Every change to `aiService.ts` or `renderService.ts` should be validated against these expectations.

## Structure

```
benchmark/
├── podcast/
│   ├── video.mp4 (Required, not checked into git)
│   ├── transcript.json
│   ├── expected_clips.json
│   ├── render_expectations.json
│   └── evaluation.json
├── gaming/
├── interview/
├── tutorial/
├── reaction/
└── sports/
```

## Schemas

### `transcript.json`
The exact word-level timestamp output from the transcription engine. Used to mock the first stage of the pipeline.

### `expected_clips.json`
```json
[
  {
    "expected_hook": "The exact wording of the curiosity gap.",
    "expected_payoff": "The exact wording of the conclusion.",
    "ideal_start_time": 45.2,
    "ideal_end_time": 89.1,
    "human_quality_score": 9.5
  }
]
```

### `render_expectations.json`
```json
{
  "subtitle_style": "premium_karaoke",
  "safe_area_enforced": true,
  "dynamic_crops": [
    {
      "start_time": 45.2,
      "end_time": 89.1,
      "focus": "speaker_1"
    }
  ]
}
```

## Running Benchmarks
*(CLI tool to be built in `scripts/benchmark_runner.ts`)*
