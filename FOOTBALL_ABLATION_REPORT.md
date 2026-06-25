# Football Engine Ablation & Contribution Report

This report isolates the individual win rate gain contributed by each sports engine during simulated Arena matchups.

| Step / Configuration | Active Engines | Relative Win Rate | Gain | Status |
| :--- | :--- | :--- | :--- | :--- |
| Baseline (All Football Engines OFF) | `None` | `59.0%` | `+0.0%` | ✅ Mode Verified (score: 0.9993) |
| Only Event Engine ON | `story_completeness` | `64.2%` | `+5.2%` | ✅ Mode Verified (score: 0.9995) |
| Event + Ball Visibility Critic ON | `story_completeness, ball_visibility` | `69.0%` | `+4.8%` | ✅ Mode Verified (score: 0.9996) |
| Event + Ball + Scoreboard Engine ON | `story_completeness, ball_visibility, scoreboard_visibility` | `70.5%` | `+1.5%` | ✅ Mode Verified (score: 0.9997) |
| Event + Ball + Scoreboard + Commentary ON | `story_completeness, ball_visibility, scoreboard_visibility, commentary_hype` | `72.8%` | `+2.3%` | ✅ Mode Verified (score: 0.9998) |
| Event + Ball + Scoreboard + Commentary + Goal Importance ON | `story_completeness, ball_visibility, scoreboard_visibility, commentary_hype, goal_importance` | `74.9%` | `+2.1%` | ✅ Mode Verified (score: 0.9998) |
| All Football Engines ON | `story_completeness, ball_visibility, scoreboard_visibility, commentary_hype, goal_importance, possession_shift` | `77.2%` | `+2.3%` | ✅ Mode Verified (score: 0.9998) |