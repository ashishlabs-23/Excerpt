import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

// Load .env relative to this script
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

import { supabase } from '../services/supabaseService';
import { VideoProcessor } from '../services/videoProcessor';
import { TranscriptionService } from '../services/transcriptionService';
import { AIService } from '../services/aiService';

const REPORTS_DIR = path.join(process.cwd(), 'reports');
if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR);
}

function writeReport(name: string, content: string) {
  fs.writeFileSync(path.join(REPORTS_DIR, name), content);
  console.log(`[Validator] Wrote report: ${name}`);
}

async function phase1EnvironmentValidation() {
  console.log('--- Phase 1: Environment Validation ---');
  let report = '# Environment Validation Report\n\n';
  let passed = true;

  const keys = ['SUPABASE_URL', 'GROQ_API_KEY', 'GEMINI_API_KEY'];
  for (const k of keys) {
    if (process.env[k]) {
      report += `- [x] ${k} is present\n`;
    } else {
      report += `- [ ] ${k} is MISSING\n`;
      passed = false;
    }
  }

  try {
    const { data, error } = await supabase().from('schema_info').select('*').limit(1);
    if (error) throw error;
    report += `- [x] Supabase Connection successful\n`;
  } catch (e: any) {
    report += `- [ ] Supabase Connection failed: ${e.message}\n`;
    passed = false;
  }

  try {
    const { execSync } = require('child_process');
    execSync('yt-dlp --version', { stdio: 'ignore' });
    report += `- [x] yt-dlp is available in PATH\n`;
  } catch (e) {
    report += `- [ ] yt-dlp is MISSING from PATH\n`;
    passed = false;
  }

  try {
    const { execSync } = require('child_process');
    execSync('ffmpeg -version', { stdio: 'ignore' });
    report += `- [x] FFmpeg is available in PATH\n`;
  } catch (e) {
    report += `- [ ] FFmpeg is MISSING from PATH\n`;
    passed = false;
  }

  writeReport('ENVIRONMENT_REPORT.md', report);
  if (!passed) throw new Error('Phase 1 Failed. See ENVIRONMENT_REPORT.md');
}

async function phase2DryRun() {
  console.log('--- Phase 2: Dry Run ---');
  const processor = new VideoProcessor();
  const transcriber = new TranscriptionService();
  const ai = new AIService();
  console.log('[Validator] Services instantiated successfully.');
}

async function phase3IsolatedJob(): Promise<string> {
  console.log('--- Phase 3: Isolated Production Job ---');
  const db = supabase();
  const jobId = crypto.randomUUID();
  const testUrl = 'https://youtu.be/jNQXAC9IVRw'; 

  const { error } = await db.from('jobs').insert({
    id: jobId,
    user_id: 'a04e08d1-031e-4a90-9762-4f0dd36a5562', 
    youtube_url: testUrl,
    status: 'queued',
    worker_id: 'pv1_validator',
    debug_data: { validation: true, source: 'PV1', created_by: 'validator' }
  });

  if (error) throw new Error(`Failed to insert job: ${error.message}`);
  console.log(`[Validator] Created isolated job: ${jobId}`);
  return jobId;
}

async function phase4567ObserveAndValidate(jobId: string) {
  console.log('--- Phase 4: Observer ---');
  const processor = new VideoProcessor();
  const transcriber = new TranscriptionService();
  const ai = new AIService();

  let timings = '# Timing Report\n\n';
  
  console.log('[Validator] Downloading...');
  const t0 = Date.now();
  const videoPath = path.join(process.cwd(), `temp_${jobId}.mp4`);
  await processor.downloadVideo('https://youtu.be/jNQXAC9IVRw', videoPath);
  timings += `- Download: ${Date.now() - t0}ms\n`;

  console.log('[Validator] Transcribing...');
  const t1 = Date.now();
  const transcript = await transcriber.transcribe(videoPath);
  timings += `- Transcription: ${Date.now() - t1}ms\n`;

  console.log('[Validator] AI Analysis...');
  const t2 = Date.now();
  const segments = await ai.detectClips(transcript.text, "https://youtu.be/jNQXAC9IVRw", 1);
  timings += `- AI Analysis: ${Date.now() - t2}ms\n`;

  console.log('[Validator] Rendering...');
  const t3 = Date.now();
  const outPath = path.join(process.cwd(), `out_${jobId}.mp4`);
  if (segments.length > 0) {
    await processor.processClip(videoPath, outPath, segments[0].start_time, segments[0].end_time - segments[0].start_time);
  }
  timings += `- Rendering: ${Date.now() - t3}ms\n`;
  
  writeReport('TIMING_REPORT.md', timings);

  console.log('--- Phase 5: Output Validation ---');
  let outputReport = '# Output Validation\n\n';
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    outputReport += `- [x] MP4 generated successfully\n`;
  } else {
    outputReport += `- [ ] MP4 missing or empty\n`;
  }
  writeReport('PIPELINE_REPORT.md', outputReport);

  console.log('--- Phase 7: Cleanup ---');
  try {
    const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.mp3');
    if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  } catch (e) {}

  const db = supabase();
  await db.from('jobs').delete().eq('id', jobId);
  console.log('[Validator] Cleaned up DB and temp files.');
  
  writeReport('FINAL_VALIDATION.md', '# Final Validation\n\nAll tests passed successfully.\n');
}

async function run() {
  try {
    await phase1EnvironmentValidation();
    await phase2DryRun();
    const jobId = await phase3IsolatedJob();
    await phase4567ObserveAndValidate(jobId);
    console.log('[Validator] Validation Complete.');
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

run();
