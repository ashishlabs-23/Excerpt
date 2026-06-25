import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { VoiceoverService } from '../src/services/VoiceoverService';
import { VoiceQualityEngine } from '../src/services/VoiceQualityEngine';
import { DatabaseService } from '../src/services/supabaseService';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const db = new DatabaseService();
const voiceoverService = VoiceoverService.getInstance();
const qualityEngine = VoiceQualityEngine.getInstance();

async function runAudit() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('VOICEOVER STUDIO MASTER AUDIT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Phase 4: TTS Provider Audit
  console.log('>>> PHASE 4: TTS PROVIDER AUDIT');
  const tempDir = path.join(process.cwd(), 'temp', 'audit');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const providers = ['google', 'openai', 'elevenlabs'] as const;
  const testText = 'Hello, this is a master audit of the Neural Voiceover Engine.';
  const segmentId = crypto.randomUUID();

  for (const provider of providers) {
    console.log(`\nTesting provider: ${provider}...`);
    try {
      const startMs = Date.now();
      const result = await voiceoverService.synthesize(
        testText,
        { provider },
        tempDir,
        segmentId
      );
      const latency = Date.now() - startMs;
      console.log(`[PASS] ${provider} succeeded in ${latency}ms.`);
      
      // Phase 6: Audio Quality Engine
      console.log(`\n>>> PHASE 6: AUDIO QUALITY ENGINE (${provider})`);
      const report = await qualityEngine.analyze(result.audioPath, testText);
      console.log(`Quality Score: ${report.score}/100`);
      console.log(`Peak dBFS: ${report.metrics.peakDbFS.toFixed(1)}`);
      console.log(`WPM: ${report.metrics.estimatedWPM}`);
      report.issues.forEach(i => console.log(`[ISSUE] ${i.severity.toUpperCase()}: ${i.detail} (Penalty: ${i.penalty})`));

    } catch (error: any) {
      console.error(`[FAIL] ${provider} failed:`, error.message);
    }
  }

  // Phase 5: Script Intelligence (Sanitization)
  console.log('\n>>> PHASE 5: SCRIPT INTELLIGENCE (Sanitization)');
  const dirtyText = '<ssml>Bad injection attempt { } [ ]</ssml>   Extra   Spaces';
  try {
    const { sanitizeNarrationText } = await import('../src/services/VoiceoverService');
    const clean = sanitizeNarrationText(dirtyText);
    console.log(`Original: ${dirtyText}`);
    console.log(`Sanitized: ${clean}`);
    if (clean === 'Bad injection attempt Extra Spaces') {
      console.log('[PASS] Sanitization works correctly.');
    } else {
      console.log('[FAIL] Sanitization returned unexpected result.');
    }
  } catch (e: any) {
    console.error('[FAIL] Sanitization threw error:', e.message);
  }

  // Phase 12: Failure Simulation
  console.log('\n>>> PHASE 12: FAILURE SIMULATION (Circuit Breakers)');
  const status = voiceoverService.getProviderStatus();
  console.log('Current Provider Status:', status);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('AUDIT COMPLETED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

runAudit().catch(console.error);
