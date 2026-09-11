import * as fs from 'fs';
import * as path from 'path';

const categories = ['podcast', 'gaming', 'interview', 'tutorial', 'football'];
const baseDir = path.join(__dirname);

categories.forEach(category => {
  const catDir = path.join(baseDir, category);
  if (!fs.existsSync(catDir)) {
    fs.mkdirSync(catDir, { recursive: true });
  }

  // Define files to create if they don't exist
  const files = {
    'metadata.json': JSON.stringify({ category, language: "en", duration_sec: 0, speakers: [] }, null, 2),
    'transcript.json': JSON.stringify({ words: [] }, null, 2),
    'expected_clips.json': JSON.stringify([], null, 2),
    'expected_render.json': JSON.stringify({ crop_strategy: "center", safe_areas: [] }, null, 2),
    'expected_subtitles.ass': `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`,
    'evaluation.json': JSON.stringify({ scores: { retention: 0, replayability: 0 }, notes: "" }, null, 2)
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(catDir, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Created ${filePath}`);
    }
  }
});
console.log('Benchmark scaffold complete.');
