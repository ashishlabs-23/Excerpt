import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env
dotenv.config({ path: path.join(__dirname, '../../../.env') });

console.log('SUPABASE_URL:', process.env.SUPABASE_URL);

async function test() {
  try {
    console.log('Importing queueService...');
    const { queueService } = require('./services/queueService');
    
    console.log('Calling addJob...');
    const jobId = await queueService.addJob({ 
      videoUrl: "https://www.youtube.com/watch?v=9AY_Jpm_42Y", 
      numClips: 3 
    });
    
    console.log('Success! JobId:', jobId);
  } catch (error: any) {
    console.error('FAILED TO ADD JOB:', error);
    if (error.stack) console.error(error.stack);
  }
}

test();
