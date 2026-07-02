import { config } from 'dotenv';
config();
import { Client } from 'pg';

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const res = await client.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid = 'job_status'::regtype;`);
  console.log("Enums:", res.rows);
  const triggerRes = await client.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'check_job_status_transition';`);
  console.log("Trigger:", triggerRes.rows[0]?.pg_get_functiondef);
  await client.end();
}
run();
