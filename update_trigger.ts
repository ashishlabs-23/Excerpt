import { config } from 'dotenv';
config({ path: 'apps/api/.env' });
import pg from 'pg';
import fs from 'fs';

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL in .env");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  const sql = fs.readFileSync('apply_trigger.sql', 'utf8');
  await client.query(sql);
  console.log("Trigger updated successfully!");
  await client.end();
}
run();
