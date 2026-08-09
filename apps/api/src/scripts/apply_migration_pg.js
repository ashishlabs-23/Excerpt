// apply_migration_pg.js — Apply DDL migration directly via pg TCP connection
// Supabase accepts JWTs as passwords for the service role via the session pooler
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'maldlbmoeorpetllaceg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbGRsYm1vZW9ycGV0bGxhY2VnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ1MDYyNywiZXhwIjoyMDk4MDI2NjI3fQ.7WDVHZKx8f2km8dkHVtRycTPCr4c7MxZtPpJEt15xKM';

// Supabase session pooler endpoint accepts JWT as password for role postgres
const connectionConfig = {
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: SERVICE_KEY,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
};

// Read migration SQL
const migrationPath = path.join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260805000000_dashboard_schema_hardening.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

async function main() {
  const client = new Client(connectionConfig);
  
  try {
    console.log(`Connecting to ${connectionConfig.host}:${connectionConfig.port}...`);
    await client.connect();
    console.log('Connected. Running migration...\n');

    await client.query('BEGIN');
    
    const result = await client.query(migrationSQL);
    console.log('Migration executed successfully.');
    
    // Reload PostgREST schema cache
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('PostgREST schema cache reload signal sent.');

    await client.query('COMMIT');
    
    console.log('\nVerifying tables...');
    const verify = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('video_analysis_cache', 'render_metrics', 'video_timeline_coverage')
      ORDER BY table_name;
    `);
    console.log('Tables found:', verify.rows.map(r => r.table_name));

    const stageLabel = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'jobs' AND column_name = 'stage_label';
    `);
    console.log('stage_label column:', stageLabel.rows.length > 0 ? 'EXISTS' : 'MISSING');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Migration failed:', err.message);
    if (err.code) console.error('Error code:', err.code);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

main();
