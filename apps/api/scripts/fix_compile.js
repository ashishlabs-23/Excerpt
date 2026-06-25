const fs = require('fs');
const path = require('path');

function replaceFileContent(filePath, findPattern, replaceWith) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(findPattern, replaceWith);
    fs.writeFileSync(filePath, content, 'utf8');
}

// Fix BoundaryFailureEngine
replaceFileContent(
    'apps/api/src/services/intelligence/BoundaryFailureEngine.ts',
    "import { DatabaseService } from '../../supabaseService';",
    "import { DatabaseService } from '../supabaseService';"
);

// Fix StoryGraph.ts
replaceFileContent(
    'apps/api/src/services/intelligence/StoryGraph.ts',
    "{ sourceId: source.id, targetId: target.id, type: 'causal', weight: 0.8 }",
    "{ sourceId: source.id, targetId: target.id, type: 'causal', weight: 0.8, confidence: 0.8 }"
);

// Fix renderWorker.ts
const renderWorkerPath = 'apps/api/src/workers/renderWorker.ts';
let renderWorkerContent = fs.readFileSync(renderWorkerPath, 'utf8');

// Replace the cutting / captioning logic
renderWorkerContent = renderWorkerContent.replace(
    /if \(clipWords && clipWords.length > 0\) \{[\s\S]*?\} else \{[\s\S]*?cropMs = Date.now\(\) - cropMsStart;[\s\S]*?\}/m,
    `const intermediatePath = path.join(tempDir, \`cut-\${clipId}.mp4\`);
      console.log(\`[RenderWorker]: Cutting clip \${clipId}...\`);
      await processor.processClip(videoPath, intermediatePath, clipStart, clipEnd - clipStart, cropPlan);
      cropMs = Date.now() - cropMsStart;

      if (clipWords && clipWords.length > 0) {
        const assFilePath = path.join(tempDir, \`subs-\${clipId}.ass\`);
        captionService.generateASS(clipWords, assFilePath);
        
        const captionStart = Date.now();
        console.log(\`[RenderWorker]: Adding Viral Captions to clip \${clipId}...\`);
        await processor.addCaptions(intermediatePath, outputPath, assFilePath);
        captionMs = Date.now() - captionStart;
      } else {
        const fs = require('fs');
        fs.renameSync(intermediatePath, outputPath);
      }`
);

// Replace uploadFile
renderWorkerContent = renderWorkerContent.replace(
    /storage\.uploadFile\(outputPath, storageKey, 'video\/mp4'\)/g,
    "storage.uploadFile(outputPath, storageKey)"
);
renderWorkerContent = renderWorkerContent.replace(
    /storage\.uploadFile\(thumbnailPath, thumbStorageKey, 'image\/jpeg'\)/g,
    "storage.uploadFile(thumbnailPath, thumbStorageKey)"
);

fs.writeFileSync(renderWorkerPath, renderWorkerContent, 'utf8');
console.log('Fixed compile errors');
