const fs = require('fs');
const videoWorkerPath = 'apps/api/src/workers/videoWorker.ts';
let content = fs.readFileSync(videoWorkerPath, 'utf8');

// Fix 1: (clip as any).words
content = content.replace(/clip\.words \|\| \[\]/g, '(clip as any).words || []');

// Fix 2: const dbClips = dbClips.map -> const clipsToSave = dbClips.map
content = content.replace(/const dbClips = dbClips\.map/g, 'const clipsToSave = dbClips.map');
content = content.replace(/await db\.saveClips\(dbClips\);/g, 'await db.saveClips(clipsToSave);');

fs.writeFileSync(videoWorkerPath, content, 'utf8');
console.log('Fixed videoWorker.ts remaining errors');
