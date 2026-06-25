# Publish Decision Accuracy

This audit tracks Excerpt's ability to determine if a clip is truly publish-worthy, regardless of whether it correctly identified a goal or a story.

### Confusion Matrix
| | Editor Publish | Editor Reject |
|---|---|---|
| **Excerpt Publish** | True Positive (450) | False Positive (65) |
| **Excerpt Reject** | False Negative (35) | True Negative (310) |

### Core Metrics
- **Precision**: 87.4% *(When Excerpt publishes, how often is it right?)*
- **Recall**: 92.8% *(How many publishable clips did Excerpt catch?)*
- **F1 Score**: 0.900 *(Harmonic mean - Target: > 0.85)*

## Conclusion
The F1 Score of 0.900 indicates strong publish decision alignment. The primary failure mode is currently False Positives (65), where Excerpt is overly eager to publish clips that lack the necessary editorial context.
