# Excerpt Browser Validation & End-to-End Product Checklist

This checklist defines product verification scenarios to validate Excerpt's user interface, database connectivity, and telemetry logging.

---

## 1. Product Verification Checks

### Test Scenario 1: Upload Football Match URL
- [ ] Navigated to the dashboard page (`/dashboard`).
- [ ] Inserted a valid YouTube match URL or uploaded local source clip.
- [ ] Confirmed job creation and lock status on the pipeline worker.
- [ ] Confirmed status progress updates from `0%` to `100%`.
- [ ] Confirmed clips render successfully and display in the generated gallery.

### Test Scenario 2: Generate More Highlights (Cache Trigger)
- [ ] Clicked on the "Generate More Highlights" action.
- [ ] Confirmed total generation latency decreases by **over 85%** (Sub-30 seconds).
- [ ] Verified cache hit indicator displays `true` in system logs.
- [ ] Confirmed new clips extract only from uncovered zones of the timeline heatmap.

### Test Scenario 3: Excerpt Arena Pairwise Comparison
- [ ] Opened the Arena page (`/arena`).
- [ ] Voted on comparison matchups.
- [ ] Selected structured preference reasons (*Better Hook, Better Captions, Better Crop, Better Story, Better Pacing*).
- [ ] Verified the "votes contributed" counter increments dynamically.
- [ ] Confirmed matchup rows successfully insert into `public.human_preference_matchups` table.

### Test Scenario 4: Quality Dashboard Telemetry
- [ ] Navigated to the system analytics tab.
- [ ] Confirmed draft, quality, and explorer runtimes are plotted.
- [ ] Verified timeline coverage statistics display targets above `85%`.
- [ ] Confirmed cache hit rate aggregates correctly.
