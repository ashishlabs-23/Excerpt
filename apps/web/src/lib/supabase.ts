import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://maldlbmoeorpetllaceg.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbGRsYm1vZW9ycGV0bGxhY2VnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzOTAwOTYsImV4cCI6MjA5ODAyNjYyN30.aUM3gwBDYUdOQbjHaKkC_BHTmZ1xo5--0MRl59c_XT8";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  // Fix: If key starts with invalid publishable token format, fallback to valid JWT anon key
  if (!anonKey || anonKey.startsWith("sb_publishable_") || anonKey.length < 50) {
    anonKey = DEFAULT_SUPABASE_ANON_KEY;
  }

  if (!browserClient) {
    browserClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return browserClient;
}
