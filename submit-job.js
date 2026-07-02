import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Looking up user manuashi2018@gmail.com...");
  
  // 1. Get the user
  const { data: { users }, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error("Failed to list users", userErr);
    return;
  }
  
  let user = users.find(u => u.email === 'manuashi2018@gmail.com' || u.email === 'manuashi2018@gmail.com.com');
  if (!user) {
    console.log("User not found, creating user...");
    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: 'manuashi2018@gmail.com',
      password: 'password123',
      email_confirm: true
    });
    if (createErr) {
      console.error("Failed to create user", createErr);
      return;
    }
    user = newUser.user;
    console.log("User created and auto-confirmed:", user.id);
  } else {
    console.log("User found:", user.id);
    if (!user.email_confirmed_at) {
       console.log("Auto-confirming email for user...");
       await supabase.auth.admin.updateUserById(user.id, { email_confirm: true });
       console.log("Email confirmed.");
    }
  }

  // 2. Create the job
  console.log("Inserting job for YouTube URL: https://youtu.be/oBQTUHTSfTs?si=4qwR0zPkTzHP7NBB...");
  const { data: job, error: insertErr } = await supabase.from('jobs').insert({
    user_id: user.id,
    youtube_url: 'https://youtu.be/oBQTUHTSfTs?si=4qwR0zPkTzHP7NBB',
    status: 'queued'
  }).select().single();

  if (insertErr) {
    console.error("Failed to insert job", insertErr);
    return;
  }

  console.log(`✅ Job successfully created! Job ID: ${job.id}`);
  console.log("Waiting for worker to pick it up...");

  // 3. Monitor the job
  const interval = setInterval(async () => {
    const { data: currentJob } = await supabase.from('jobs').select('status').eq('id', job.id).single();
    if (currentJob) {
      console.log(`[Status Update] Job ${job.id} is now: ${currentJob.status}`);
      if (currentJob.status === 'completed' || currentJob.status === 'failed') {
        clearInterval(interval);
        console.log(`Job reached terminal state: ${currentJob.status}`);
      }
    }
  }, 5000);
}

run();
