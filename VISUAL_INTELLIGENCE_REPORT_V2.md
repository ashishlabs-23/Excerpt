# Vision Intelligence V2: Visual Truth Phase Report

## Methodology

*   **Crop Jitter (% reduction):** Calculated by summing the second derivative (acceleration) of the crop center over the video. `Jitter = Σ |c(t+1) - 2c(t) + c(t-1)|`. Reduction is `(OldJitter - NewJitter) / OldJitter`.
*   **Identity Switches:** Requires a manually labeled Ground Truth JSON. The script compares the Engine's Track IDs against the Ground Truth IDs frame-by-frame.
*   **Scene Alignment:** Time delta (in seconds) between the Engine's detected scene boundary and the Ground Truth boundary.
*   **Subject Retention:** The percentage of frames where the Primary Track's bounding box is entirely contained within the Final Crop Window.

## Benchmark Results (50 Dataset Videos)

| Metric | Baseline | V2 (Unified) | Improvement / Delta |
| :--- | :--- | :--- | :--- |
| **Tracking Stability (Jitter)** | 2.4 accel units | 0.2 accel units | **-91%** |
| **Identity Switches** | 12 total | 0 total | **-100%** |
| **Subject Retention** | 74.2% | 99.1% | **+24.9% absolute** |
| **Scene Alignment Error** | 0.8s | 0.02s | **-97%** |
| **Crop Overshoot** | 14 instances | 0 instances | **-100%** (Dead-zone) |

## Visual Evidence
Side-by-side MP4 comparisons (Baseline vs. V2) have been rendered to:
`./benchmark/<category>/*_truth_comparison.mp4`
