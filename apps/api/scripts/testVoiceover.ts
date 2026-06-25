import { DatabaseService } from '../src/services/supabaseService';
import { StorageService } from '../src/services/storageService';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function runTest() {
  const db = new DatabaseService();
  const supabase = db.getSupabase();

  console.log("=== EXCERPT VOICEOVER PROOF AGENT: API TEST ===");
  
  // 1. Find a completed clip
  console.log("\\n[1] Finding a completed football clip...");
  const { data: clips, error: clipsErr } = await supabase
    .from('clips')
    .select('*')
    .eq('status', 'uploaded')
    .not('storage_path', 'is', null)
    .limit(1);

  if (clipsErr || !clips || clips.length === 0) {
    console.error("FAILURE: Could not find any completed clips in the database.");
    return;
  }

  const clip = clips[0];
  console.log(`Found Clip: ${clip.id} - ${clip.title}`);
  
  // 2. Insert directly into voiceover_clips
  console.log("\\n[2] Submitting Voiceover Generation directly via DB insert (bypassing auth)...");
  
  let userId = '1b249a0f-5d78-4612-bba6-80d8df83bbf6';

  const { data: insertedVc, error: insertErr } = await supabase
    .from('voiceover_clips')
    .insert({
      source_clip_id: clip.id,
      user_id: userId,
      status: 'pending',
      provider: 'google',
      voice: 'en-US-Standard-B',
      narration_text: 'Test narration for the validation agent',
      metadata: {}
    })
    .select('id')
    .single();

  if (insertErr || !insertedVc) {
    console.error(`FAILURE: Could not insert into voiceover_clips: ${JSON.stringify(insertErr)}`);
    return;
  }
    
  console.log(`Successfully inserted Voiceover Clip ID: ${insertedVc.id}`);
    
  // 3. Monitor Status in Database
  console.log("\\n[3] Monitoring Database for processing... (waiting for completion)");
  let status = 'pending';
  let voiceoverClip = null;
  let attempts = 0;
    
  while (status !== 'completed' && status !== 'failed' && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000)); // 2s polling
    attempts++;
      
    const { data: currentVc, error: vcErr } = await supabase
      .from('voiceover_clips')
      .select('*')
      .eq('id', insertedVc.id)
      .single();
        
    if (currentVc) {
      if (currentVc.status !== status) {
        console.log(`Status changed: ${status} -> ${currentVc.status}`);
        status = currentVc.status;
      }
      voiceoverClip = currentVc;
    }
  }
    
  if (status === 'failed') {
    console.error(`FAILURE: Voiceover generation failed. Error: ${voiceoverClip?.error_message}`);
    return;
  }
    
  if (status !== 'completed') {
    console.error(`FAILURE: Voiceover generation timed out.`);
    return;
  }
    
  console.log("\\n[4] Validating Storage...");
  console.log(`Video URL: ${voiceoverClip.video_path}`);
  console.log(`Audio URL: ${voiceoverClip.audio_path}`);
    
  if (!voiceoverClip.video_path || !voiceoverClip.audio_path) {
    console.error(`FAILURE: Voiceover completed but paths are empty.`);
    return;
  }
    
  console.log("\\n[5] Validating Isolation...");
  const { count: jobCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('clip_id', clip.id)
    .eq('job_type', 'voiceover');
      
  if (jobCount && jobCount > 0) {
    console.error(`FAILURE: Found voiceover jobs in the legacy 'jobs' table! Isolation broken.`);
    return;
  } else {
    console.log(`Isolation Test: Passed (0 jobs in 'jobs' table)`);
  }
    
  console.log("\\n=== VALIDATION COMPLETED SUCCESSFULLY ===");
}

runTest().then(() => process.exit(0));
