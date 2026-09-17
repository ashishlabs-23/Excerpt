import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Setup env
const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase credentials in env.");
  process.exit(1);
}

const db = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Starting Dead Letter Queue (DLQ) Audit...");
  
  const { data: deadJobs, error } = await db
    .from('jobs')
    .select('id, status, failed_reason, payload, updated_at')
    .eq('status', 'dead_letter')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error("Failed to fetch dead letter jobs:", error.message);
    process.exit(1);
  }

  if (!deadJobs || deadJobs.length === 0) {
    console.log("DLQ is empty. System is healthy.");
    return;
  }

  console.log(`\nFound ${deadJobs.length} Dead Letter Jobs:\n`);
  
  const issueCounts: Record<string, number> = {};

  for (const job of deadJobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`Failed Reason: ${job.failed_reason}`);
    console.log(`Exhausted At: ${job.updated_at}`);
    console.log(`Payload Retry State: ${JSON.stringify(job.payload?.retry || {})}`);
    console.log('-'.repeat(40));

    const reason = job.failed_reason || 'Unknown';
    issueCounts[reason] = (issueCounts[reason] || 0) + 1;
  }

  console.log("\nIssue Summary:");
  for (const [reason, count] of Object.entries(issueCounts)) {
    console.log(`- ${reason}: ${count}`);
  }
}

run().catch(console.error);
