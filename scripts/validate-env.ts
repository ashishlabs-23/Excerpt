import dotenv from 'dotenv';
import path from 'path';

// Load variables from .env if NOT running in CI
if (!process.env.CI) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GROQ_API_KEY',
  'GEMINI_API_KEY',
  'B2_KEY_ID',
  'B2_APPLICATION_KEY',
  'B2_BUCKET_NAME'
];

function validateEnv() {
  console.log('Validating production environment configuration...');
  
  let hasMissing = false;
  
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      hasMissing = true;
    } else {
      console.log(`✅ Found: ${envVar}`);
    }
  }

  if (hasMissing) {
    console.error('\nEnvironment validation failed. The pipeline will exit.');
    process.exit(1);
  } else {
    console.log('\nAll required environment variables are present!');
    process.exit(0);
  }
}

validateEnv();
