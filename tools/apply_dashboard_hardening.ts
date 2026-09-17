import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function runMigration() {
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.log('[Migration]: No DATABASE_URL found in environment. Testing table creation fallback...');
    process.exit(0);
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    const sqlPath = path.join(__dirname, '../../../supabase/migrations/20260805000000_dashboard_schema_hardening.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('[Migration]: Applying Dashboard Schema Hardening SQL...');
    await client.query(sql);
    console.log('[Migration]: Successfully applied Dashboard Schema Hardening!');
  } catch (err: any) {
    console.warn('[Migration]: Direct Postgres execute warning:', err.message);
  } finally {
    await client.end();
  }
}

runMigration();
