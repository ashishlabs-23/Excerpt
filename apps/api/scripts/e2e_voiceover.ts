import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseService } from '../src/services/supabaseService';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const db = new DatabaseService();

async function runE2E() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('NEURAL VOICEOVER STUDIO E2E INTEGRATION TRACE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const userId = 'd3b07384-d113-4ec5-a587-2e1d09e53066';
  const projectId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const sourceVideo = 'c:/Projects/Ashishlabs/Excerpt/test_download.mp4';

  if (!fs.existsSync(sourceVideo)) {
    console.error(`[FAIL] Source video file not found at ${sourceVideo}`);
    process.exit(1);
  }

  console.log(`1. Creating voiceover project ${projectId}...`);
  const project = await db.createVoiceoverProject({
    id: projectId,
    user_id: userId,
    source_url: sourceVideo,
    source_duration: 30.0,
    title: 'E2E Voiceover Audit Project',
    status: 'draft'
  });
  console.log(`[PASS] Project created: ${project.title}`);

  console.log('\n2. Creating voiceover segments...');
  const segments = [
    {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      start_time: 1.5,
      end_time: 6.5,
      narration_text: 'This is the first test segment for neural voiceover in Excerpt Pro.',
      clip_type: 'narration',
      status: 'pending'
    },
    {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      start_time: 10.0,
      end_time: 16.0,
      narration_text: 'Here is the second voiceover narration block, aligned precisely to ten seconds.',
      clip_type: 'narration',
      status: 'pending'
    }
  ];

  const savedSegments = await db.saveVoiceoverSegments(segments);
  console.log(`[PASS] Saved ${savedSegments.length} segments.`);

  console.log('\n3. Creating voiceover job in queue...');
  const voiceConfig = {
    provider: 'google',
    gender: 'MALE',
    speakingRate: 1.0
  };

  const job = await db.createJob({
    id: jobId,
    user_id: userId,
    video_url: sourceVideo,
    job_type: 'voiceover',
    status: 'queued',
    progress: 0,
    payload: {
      voiceover_project_id: projectId,
      voice_config: voiceConfig,
      title: 'E2E Voiceover Audit Project',
      job_type: 'voiceover' // redundantly set in payload just in case
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  console.log(`[PASS] Job ${jobId} queued.`);

  // Update project status to link to job
  await db.updateVoiceoverProject(projectId, { status: 'processing', source_job_id: jobId });

  console.log('\n4. Monitoring Job Progress in Queue...');
  console.log('Waiting for worker to claim and process the job...\n');

  let completed = false;
  let attempts = 0;
  const maxPolls = 60; // 2 minutes max

  while (!completed && attempts < maxPolls) {
    attempts++;
    const currentJob = await (db as any).db
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()
      .then((res: any) => res.data);

    if (!currentJob) {
      console.error(`[FAIL] Job ${jobId} disappeared from database.`);
      break;
    }

    const timeString = new Date().toLocaleTimeString();
    console.log(`[${timeString}] Status: ${currentJob.status} | Progress: ${currentJob.progress}% | Stage: ${currentJob.current_stage || 'N/A'} - ${currentJob.stage_label || 'N/A'}`);

    if (currentJob.status === 'completed') {
      console.log('\n[SUCCESS] E2E Voiceover Pipeline completed successfully!');
      console.log('Result payload:', JSON.stringify(currentJob.result, null, 2));
      completed = true;
      break;
    } else if (currentJob.status === 'failed' || currentJob.status === 'dead_letter') {
      console.error(`\n[FAIL] E2E Voiceover Pipeline failed: ${currentJob.failed_reason}`);
      break;
    }

    await new Promise(r => setTimeout(r, 2000));
  }

  if (!completed) {
    console.error(`\n[FAIL] E2E Voiceover trace timed out or stalled.`);
  }

  console.log('\n5. Querying generated clips for job...');
  const { data: clips, error: clipError } = await (db as any).db
    .from('clips')
    .select('*')
    .eq('job_id', jobId);

  if (clipError) {
    console.error(`Error querying clips: ${clipError.message}`);
  } else {
    console.log(`Found ${clips?.length || 0} clips in database.`);
    clips?.forEach((c: any) => {
      console.log(`- Clip ID: ${c.id}`);
      console.log(`  URL: ${c.video_url}`);
      console.log(`  Title: ${c.title}`);
      console.log(`  Metadata:`, JSON.stringify(c.metadata, null, 2));
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('E2E TRACE COMPLETED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runE2E().catch(console.error);
