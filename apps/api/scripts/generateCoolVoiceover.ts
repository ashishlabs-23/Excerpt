import { DatabaseService } from '../src/services/supabaseService';
import { QueueService } from '../src/services/queueService';
import crypto from 'crypto';

async function run() {
  const db = new DatabaseService();
  const queue = new QueueService();
  
  console.log('Fetching a completed clip to use as the source...');
  const clip = await db.getClip('76dd023a-7494-48f1-8894-64aa08f5d80b');
  if (!clip) {
    console.error('No completed clips found for the user!');
    process.exit(1);
  }

  console.log(`Selected Clip: ${clip.id} - ${clip.title}`);

  const narrationText = "What an absolutely spectacular sequence of play! The vision, the execution, the sheer brilliance on the pitch! This is why we love the beautiful game. Every touch is a masterclass in precision!";

  console.log('Generating voiceover with script:');
  console.log(`"${narrationText}"`);

  // We bypass auth by directly inserting into voiceover_clips and adding the job to Redis
  const voiceoverId = crypto.randomUUID();
  await db.createVoiceoverClip({
    id: voiceoverId,
    source_clip_id: clip.id,
    user_id: '1b249a0f-5d78-4612-bba6-80d8df83bbf6',
    status: 'pending',
    provider: 'google',
    voice: 'en-GB-Standard-B',
    narration_text: narrationText,
  });

  console.log(`Inserted Voiceover Job ID: ${voiceoverId}`);
  console.log('The worker will pick it up automatically!');
  
  // Actually, we don't need to add to Redis if the worker polls the DB directly!
  // The voiceoverWorker polls voiceover_clips directly via RPC 'claim_next_voiceover_clip'.
  process.exit(0);
}

run().catch(console.error);
