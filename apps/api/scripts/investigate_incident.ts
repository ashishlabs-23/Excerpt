import dotenv from 'dotenv';
import path from 'path';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';
import { StorageService } from '../src/services/storageService';
import fs from 'fs';
import { execSync } from 'child_process';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

async function runInvestigation() {
  console.log('=========================================================');
  console.log('INCIDENT INVESTIGATION REPORT: STEP 3, 4, 6, 7 & 8');
  console.log('=========================================================\n');

  // 1. Database Verification
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: clips, error } = await supabase
    .from('clips')
    .select('*')
    .eq('status', 'uploaded')
    .neq('storage_path', '')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error || !clips || clips.length === 0) {
    console.error('DATABASE CHECK FAILED:', error);
    return;
  }

  console.log('1. DATABASE VERIFICATION (Latest Clip):');
  const clip = clips[0];
  console.log({
    id: clip.id,
    job_id: clip.job_id,
    status: clip.status,
    storage_path: clip.storage_path,
    video_url: clip.video_url,
    thumbnail_url: clip.thumbnail_url,
    created_at: clip.created_at
  });

  // 2. Storage & B2 Verification
  console.log('\n2. STORAGE & PHYSICAL OBJECT VERIFICATION:');
  const storageKey = clip.storage_path || clip.video_url;
  console.log('Resolved storageKey:', storageKey);

  const storageService = StorageService.getInstance();
  const signedUrl = await storageService.createSignedUrl(storageKey);
  console.log('Generated Signed B2 URL:', signedUrl);

  // GET HEADERS FROM B2
  const b2GetRes = await fetch(signedUrl);
  console.log('\nB2 Direct GET Status:', b2GetRes.status, b2GetRes.statusText);
  if (!b2GetRes.ok) {
    const errorXml = await b2GetRes.text();
    console.log('B2 Direct Error Body (XML):', errorXml);
  }

  // OPTIONS (CORS) TEST
  console.log('\n3. B2 CORS PREFLIGHT (OPTIONS) TEST:');
  const corsRes = await fetch(signedUrl, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range'
    }
  });
  console.log('B2 OPTIONS Status:', corsRes.status);
  console.log('B2 CORS Headers:');
  corsRes.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));

  // RANGE REQUEST TEST
  console.log('\n4. B2 RANGE REQUEST TEST (bytes=0-1023):');
  const rangeRes = await fetch(signedUrl, {
    headers: { 'Range': 'bytes=0-1023' }
  });
  console.log('B2 Range Status:', rangeRes.status);
  console.log('B2 Range Headers:');
  rangeRes.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));

  // 5. Media Integrity (HEAD Check)
  console.log('\n5. MEDIA INTEGRITY (HEAD Check):');
  console.log('File Content-Type:', b2HeadRes.headers.get('content-type'));
  console.log('File Content-Length:', b2HeadRes.headers.get('content-length'), 'bytes');

  // 6. API Route Trace
  console.log('\n6. EXPRESS API ROUTE TRACE:');
  const API_URL = 'http://localhost:8010';
  const tokenRes = await fetch(`${API_URL}/api/video/play-token/${clip.id}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer mock-token' }
  });
  console.log('play-token status:', tokenRes.status);
  const tokenData = await tokenRes.json();
  console.log('play-token body:', tokenData);

  if (tokenData.playUrl) {
    const playRes = await fetch(`${API_URL}${tokenData.playUrl}`, { redirect: 'manual' });
    console.log('play route status:', playRes.status);
    console.log('play route headers:');
    playRes.headers.forEach((val, key) => console.log(`  ${key}: ${val}`));
  }
}

runInvestigation().catch(console.error);
