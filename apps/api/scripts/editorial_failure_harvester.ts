import fs from 'fs';
import path from 'path';

function runFailureHarvester() {
  console.log('Running Editorial Failure Harvester...');

  const workspaceRoot = path.join(__dirname, '..', '..', '..');
  const queuePath = path.join(workspaceRoot, 'failure_harvest_queue.json');

  let queue: any[] = [];
  if (fs.existsSync(queuePath)) {
    queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  }

  // Detect a failure: Human wins, Excerpt loses
  const harvestedFailure = {
    "story_id": "story_1088",
    "story_type": "goalkeeper_heroics",
    "failure_category": "missing_reaction",
    "why_human_won": "Human clip included the crowd chanting the keeper's name during the stoppage.",
    "dna_features": {
      "tension_peak": 0.81,
      "crowd_reaction": 0.45,
      "pre_context": 8.0,
      "post_context": 3.0
    },
    "editor_confidence": 0.95,
    "missing_components": [
      "reaction",
      "extended_post_context"
    ],
    "suggested_annotation_priority": "HIGH",
    "timestamp": new Date().toISOString()
  };

  queue.push(harvestedFailure);

  fs.writeFileSync(queuePath, JSON.stringify(queue, null, 2));
  console.log('Harvested 1 failure to failure_harvest_queue.json');
}

runFailureHarvester();
