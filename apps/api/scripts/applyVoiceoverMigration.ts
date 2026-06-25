import { Client } from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

async function apply() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("No DATABASE_URL");
  
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  const sql = fs.readFileSync('../../supabase/migrations/20260622000000_voiceover_clips.sql', 'utf8');
  console.log("Applying Voiceover migration manually...");
  
  try {
    await client.query(sql);
    console.log("Migration applied successfully!");
    
    // Also notify PostgREST to reload schema
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("PostgREST schema cache reloaded.");
  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

apply().catch(console.error);
