const fs = require('fs');
const videoWorkerPath = 'apps/api/src/workers/videoWorker.ts';
let content = fs.readFileSync(videoWorkerPath, 'utf8');

// Revert clipsToSave to dbClips on line 1428 context (before Step 4)
content = content.replace(/\/\/ Save Idempotent Clips\r?\n    await db\.saveClips\(clipsToSave\);/g, '// Save Idempotent Clips\n    await db.saveClips(dbClips);');

// Cast clip.metadata as any for description
content = content.replace(/clip\.metadata\?\.description/g, '(clip.metadata as any)?.description');

// Cast clip as any for temp_embedding
content = content.replace(/clip\.temp_embedding/g, '(clip as any).temp_embedding');

fs.writeFileSync(videoWorkerPath, content, 'utf8');
console.log('Fixed typings');
