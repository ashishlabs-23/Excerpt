import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { DatabaseService } from '../src/services/supabaseService';

const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '../../.env'),
];
const foundEnv = envPaths.find(p => fs.existsSync(p));
if (foundEnv) {
  dotenv.config({ path: foundEnv });
} else {
  dotenv.config();
}

async function seed() {
  console.log('[Seed]: Populating Benchmark Ground Truth...');
  const db = new DatabaseService();
  const supabase = db.getSupabase();

  const videos = [
    {
      video_id: 'yO6POoef5cc',
      url: 'https://youtu.be/yO6POoef5cc',
      category: 'smoke_test',
      metadata: { description: 'Phase E0 Smoke Test' }
    },
    {
      video_id: 'r8SvHZxALQs',
      url: 'https://youtu.be/r8SvHZxALQs',
      category: 'goal',
      metadata: { description: 'Goal / Highlight' }
    },
    {
      video_id: 'v1_late_winner',
      url: 'https://youtu.be/mock1',
      category: 'late_winner',
      metadata: {}
    },
    {
      video_id: 'v2_save',
      url: 'https://youtu.be/mock2',
      category: 'goalkeeper_save',
      metadata: {}
    },
    {
      video_id: 'v3_counter',
      url: 'https://youtu.be/mock3',
      category: 'counter_attack',
      metadata: {}
    },
    {
      video_id: 'v4_var',
      url: 'https://youtu.be/mock4',
      category: 'var_decision',
      metadata: {}
    },
    {
      video_id: 'v5_penalty',
      url: 'https://youtu.be/mock5',
      category: 'penalty_sequence',
      metadata: {}
    },
    {
      video_id: 'v6_comeback',
      url: 'https://youtu.be/mock6',
      category: 'comeback_goal',
      metadata: {}
    },
    {
      video_id: 'v7_crowd',
      url: 'https://youtu.be/mock7',
      category: 'crowd_reaction',
      metadata: {}
    },
    {
      video_id: 'v8_derby',
      url: 'https://youtu.be/mock8',
      category: 'derby_moment',
      metadata: {}
    }
  ];

  for (const v of videos) {
    const { error } = await supabase.from('benchmark_videos').upsert({
      video_id: v.video_id,
      url: v.url,
      category: v.category,
      metadata: v.metadata
    }, { onConflict: 'video_id' });
    if (error) console.error(`Error inserting ${v.video_id}:`, error.message);
  }

  // Insert mock boundaries for E0 video so the scorecard works
  const { error: bErr } = await supabase.from('benchmark_boundaries').upsert({
    id: 'b_yO6POoef5cc_1',
    video_id: 'yO6POoef5cc',
    story_type: 'smoke_test_clip',
    human_start: 10.0,
    human_end: 25.0,
    publishable: true,
    has_buildup: true,
    has_reaction: true,
    has_replay: false
  }, { onConflict: 'id' });
  if (bErr) console.error('Error inserting boundaries:', bErr.message);

  console.log('[Seed]: 10 videos and initial ground truth seeded successfully.');
}

seed().catch(console.error);
