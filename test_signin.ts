import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Anon Key");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSignIn() {
  console.log("Testing sign in...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'indudara2006@gmail.com',
    password: 'password123',
  });

  if (error) {
    console.error("Sign in failed:", error.message);
  } else {
    console.log("Sign in successful!", data.user.id);
  }
}

testSignIn();
