# Football Intelligence Engine Influence Audit

This document audits the integration of our specialized football engines across the Excerpt ranking, cropping, and hook planning pipelines.

---

## 1. Engine Influence Matrix

| Engine | Exists | Called | Used In Ranking | Used In Crop | Used In Hook | Notes / Influence Channels |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **football_event_engine** | `✓` | `✓` | `✓` | `✓` | `✓` | Sets active state transitions and timeline search windows. |
| **ball_visibility_critic**| `✓` | `✓` | `✓` | `✓` | `—` | Enforces score penalties in ranking; centers crops around ball centroids. |
| **scoreboard_engine** | `✓` | `✓` | `✓` | `—` | `—` | Pulls late-game timestamps to weight highlights. |
| **commentary_hype_engine**| `✓` | `✓` | `✓` | `—` | `✓` | Boosts Elos of high excitement audio moments. |
| **goal_importance_engine**| `✓` | `✓` | `✓` | `—` | `—` | Feeds game-state importance metrics directly to reward weightings. |
| **football_story_engine** | `✓` | `✓` | `✓` | `—` | `—` | Promotes multi-event sequences (e.g. counterattack-to-goal flows). |
| **possession_intelligence_engine** | `✓` | `✓` | `✓` | `—` | `✓` | Triggers start frames at interception/turnover timestamps. |
| **broadcast_camera_engine** | `✓` | `✓` | `—` | `✓` | `—` | Alters zoom level rules (e.g., switches to wide crop on tactical cams). |

---

## 2. Dynamic Integration Architecture

```
                       [Video Frame Detections]
                                  │
      ┌───────────────────────────┴───────────────────────────┐
      ▼                                                       ▼
[ball_visibility_critic]                            [broadcast_camera_engine]
      │                                                       │
      ▼ (deduction)                                           ▼ (zoom scale)
[reward_model.py]                                    [sports_engine.py]
      ▲                                                       ▲
      │ (excitement / state scores)                           │ (event window crop)
      └────────────────── [football_event_engine] ────────────┘
```

- **Ranking Influence**: Fully connected to `reward_model.py` which weights story structure, commentary excitability, and ball presence.
- **Cropping Influence**: Integrated into `sports_engine.py` using camera classifications to scale frame boundaries.
- **Hook Planning Influence**: Leveraged by `football_editor_agent.py` to trigger context-aware pre-roll durations.
