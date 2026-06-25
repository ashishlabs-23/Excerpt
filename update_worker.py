import re

with open(r'c:\Projects\Ashishlabs\Excerpt\apps\api\src\workers\videoWorker.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Add import pLimit
if "import pLimit from 'p-limit';" not in content:
    content = content.replace("import crypto from 'crypto';", "import crypto from 'crypto';\nimport pLimit from 'p-limit';")

# Replace concurrency pool setup
old_pool_setup = """      // Concurrency limit of 3 to prevent CPU starvation on Windows local dev environment
      const concurrencyLimit = 3;
      const pool = new Set<Promise<void>>();
  
      for (let i = 0; i < clips.length; i++) {
        const clipIndex = i;
        const renderPromise = (async () => {"""

new_pool_setup = """      // Concurrency limit from env to prevent CPU starvation on Windows local dev environment
      const concurrencyLimit = Number(process.env.RENDER_CONCURRENCY || 3);
      const limit = pLimit(concurrencyLimit);
  
      const renderPromises = clips.map((clip: any, clipIndex: number) => limit(async () => {
        const queueWaitMs = Date.now() - stage11StartedAt;"""

content = content.replace(old_pool_setup, new_pool_setup)

# Initialize telemetry timers inside the render loop
old_timer_init = "const clipStageStartedAt = Date.now();\n          try {"
new_timer_init = """const clipStageStartedAt = Date.now();
          let cropTimeMs = 0;
          let captionTimeMs = 0;
          let uploadTimeMs = 0;
          try {"""

content = content.replace(old_timer_init, new_timer_init)

# Track cropTimeMs
old_crop = "await processor.processClip(inputPath, rawClipPath, renderStart, duration, cropPlan);"
new_crop = """const cropStart = Date.now();
            await processor.processClip(inputPath, rawClipPath, renderStart, duration, cropPlan);
            cropTimeMs = Date.now() - cropStart;"""

content = content.replace(old_crop, new_crop)

# Track captionTimeMs
old_caption = "await processor.addCaptions(rawClipPath, finalClipPath, assFilePath);"
new_caption = """const captionStart = Date.now();
              await processor.addCaptions(rawClipPath, finalClipPath, assFilePath);
              captionTimeMs = Date.now() - captionStart;"""

content = content.replace(old_caption, new_caption)

# Track uploadTimeMs
# Since there are multiple uploads, let's track the start and end of all uploads
old_upload = """const uploadSourcePathForSub = finalClipPath;"""
# Wait, I'll just wrap the whole `await storage.uploadFile` section in `const uploadStart = Date.now(); ... uploadTimeMs = Date.now() - uploadStart;`
# Let's find exactly how the upload block looks using a regex
content = re.sub(
    r'(console\.log\(`\[Worker\]: Uploading final assets for clip \$\{clipIndex \+ 1\}...`\);\n\s*)(const cleanClipStorageKey)',
    r'\g<1>const uploadStart = Date.now();\n            \g<2>',
    content
)

content = re.sub(
    r'(const thumbStorageKey = thumbPath \? await storage\.uploadFile\(.*?\n\s*: null;\n)',
    r'\g<1>            uploadTimeMs = Date.now() - uploadStart;\n',
    content
)

# Update metadata with render_telemetry
old_metadata = """execution_time_ms: Date.now() - clipStageStartedAt,
              nexus: (clip as any).nexus_metadata"""
new_metadata = """execution_time_ms: Date.now() - clipStageStartedAt,
              nexus: (clip as any).nexus_metadata,
              render_telemetry: {
                queue_wait_ms: queueWaitMs,
                crop_time_ms: cropTimeMs,
                caption_time_ms: captionTimeMs,
                upload_time_ms: uploadTimeMs,
                render_start: clipStageStartedAt,
                render_end: Date.now(),
                render_mode: process.env.RENDER_MODE || 'production',
                encoder_preset: process.env.RENDER_MODE === 'draft' ? 'ultrafast' : 'veryfast',
                story_type: clip.nexus_metadata?.story_type || clip.reason,
                publishability_score: clip.clip_score || clip.virality_score,
                emotion_score: clip.nexus_metadata?.emotion_score,
                tension_score: clip.nexus_metadata?.tension_score,
              }"""
content = content.replace(old_metadata, new_metadata)

# Replace the end of the loop
old_pool_end = """      })();

      pool.add(renderPromise);
      renderPromise.finally(() => pool.delete(renderPromise));
      if (pool.size >= concurrencyLimit) {
        await Promise.race(pool);
      }
    }
    await Promise.all(pool);"""

new_pool_end = """      }));

      await Promise.all(renderPromises);"""

content = content.replace(old_pool_end, new_pool_end)


with open(r'c:\Projects\Ashishlabs\Excerpt\apps\api\src\workers\videoWorker.ts', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated videoWorker.ts")
