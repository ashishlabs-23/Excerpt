const fs = require('fs');
const targetPath = 'apps/api/src/workers/videoWorker.ts';
let content = fs.readFileSync(targetPath, 'utf8');

// Fix 1: db.createRenderJob({ ... clipWords: clipWords ... })
content = content.replace(/clipWords: clipWords,/g, 'clipWords: clip.words || [],');

// Fix 2: payload.jobId -> jobId (around line 743)
content = content.replace(/databasePersistenceEngine.saveIntelligence\(pipelineContext, graph, payload.jobId\);/g, 'databasePersistenceEngine.saveIntelligence(pipelineContext, graph, jobId);');

// Fix 3: replace processedClips with dbClips in the appended ending
content = content.replace(/processedClips/g, 'dbClips');

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Syntax fixed');
