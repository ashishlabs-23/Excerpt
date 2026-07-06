import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const PROD_DB_URL = process.env.PROD_DB_URL;

async function main() {
  if (!PROD_DB_URL) {
    console.error("Missing PROD_DB_URL");
    process.exit(1);
  }

  const client = new Client({ connectionString: PROD_DB_URL });
  await client.connect();

  console.log("Adding attempt_count to render_jobs in Production...");
  try {
    await client.query(`
      ALTER TABLE public.render_jobs 
      ADD COLUMN IF NOT EXISTS attempt_count integer DEFAULT 0;
    `);
    console.log("Successfully added attempt_count.");
  } catch (err: any) {
    console.error("Error executing query:", err.message);
  } finally {
    await client.end();
  }
}

main();
