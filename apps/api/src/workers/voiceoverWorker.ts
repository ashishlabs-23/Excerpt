import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { execFile } from 'child_process';
import { DatabaseService } from '../services/supabaseService';
import { VoiceoverService, VoiceConfig } from '../services/VoiceoverService';
import { StorageService } from '../services/storageService';

dotenv.config();

const db = new DatabaseService();
const storage = StorageService.getInstance();
const voiceoverService = VoiceoverService.getInstance();

let isPolling = false;
let stopRequested = false;

async function processVoiceoverClip(vc: any) {
  const vcId = vc.id;
  console.log(`[VoiceoverWorker]: Processing voiceover_clip ${vcId}`);
  const startTime = Date.now();

  const updateStage = async (stage: string) => {
    console.log(`[VoiceoverWorker]: Stage -> ${stage}`);
    await db.getSupabase().from('voiceover_clips').update({
      status: stage,
      updated_at: new Date().toISOString()
    }).eq('id', vcId);
  };

  try {
    // 1. Fetch original clip to get the video url
    const { data: clipData, error: clipErr } = await db.getSupabase()
      .from('clips')
      .select('video_url, storage_path')
      .eq('id', vc.source_clip_id)
      .single();

    if (clipErr || !clipData) {
      throw new Error(`Source clip not found: ${clipErr?.message}`);
    }

    const sourceVideoUrl = clipData.storage_path || clipData.video_url;
    
    // 2. Setup paths
    const tempDir = path.join(process.cwd(), 'temp', `vo_${vcId}`);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const inputVideoPath = path.join(tempDir, 'source.mp4');
    const outputAudioPath = path.join(tempDir, 'tts.mp3');
    const outputVideoPath = path.join(tempDir, 'final.mp4');

    // 3. Download source video
    let fetchUrl = sourceVideoUrl;
    if (!fetchUrl.startsWith('http')) {
      fetchUrl = await storage.createSignedUrl(sourceVideoUrl);
    }
    
    console.log(`[VoiceoverWorker]: Downloading source video from ${fetchUrl}`);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to fetch source video: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(inputVideoPath, Buffer.from(buffer));

    // 4. Generate TTS Audio
    await updateStage('generating_audio');
    console.log(`[VoiceoverWorker]: Generating TTS via ${vc.provider}`);
    const config: VoiceConfig = {
      provider: vc.provider as any,
      voiceId: vc.voice,
    };
    
    await voiceoverService.synthesize(vc.narration_text, config, tempDir, vcId);
    const generatedAudioPath = path.join(tempDir, `vo_${vcId}.mp3`);
    fs.renameSync(generatedAudioPath, outputAudioPath);

    // 5. FFmpeg Merge (Remove original audio, replace with new TTS, shortest duration)
    await updateStage('merging');
    console.log(`[VoiceoverWorker]: Merging TTS with Video using FFmpeg...`);
    await new Promise<void>((resolve, reject) => {
      execFile('ffmpeg', [
        '-y',
        '-i', inputVideoPath,
        '-i', outputAudioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        outputVideoPath
      ], (err, stdout, stderr) => {
        if (err) {
          console.error(`[VoiceoverWorker]: FFmpeg error: ${stderr}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });

    // 6. Upload to Storage
    await updateStage('uploading');
    const s3VideoPath = `voiceovers/${vc.source_clip_id}/${vcId}.mp4`;
    const s3AudioPath = `voiceovers_audio/${vc.source_clip_id}/${vcId}.mp3`;

    console.log(`[VoiceoverWorker]: Uploading generated files...`);
    const publicVideoUrl = await storage.uploadFile(outputVideoPath, s3VideoPath);
    const publicAudioUrl = await storage.uploadFile(outputAudioPath, s3AudioPath);

    // 7. Validate Assets
    await updateStage('validating_assets');
    console.log(`[VoiceoverWorker]: Validating assets...`);
    
    // 7a. Verify audio/video files exist locally & size > 0
    if (!fs.existsSync(outputAudioPath) || fs.statSync(outputAudioPath).size === 0) {
      throw new Error("Validation failed: Local audio file is missing or empty.");
    }
    if (!fs.existsSync(outputVideoPath) || fs.statSync(outputVideoPath).size === 0) {
      throw new Error("Validation failed: Local video file is missing or empty.");
    }

    // 7b. Verify signed URLs / public URLs are reachable
    const videoHead = await fetch(publicVideoUrl, { method: 'HEAD' }).catch(() => null);
    if (!videoHead || videoHead.status !== 200) {
      // Try GET if HEAD is not supported by backend storage
      const videoGet = await fetch(publicVideoUrl).catch(() => null);
      if (!videoGet || videoGet.status !== 200) {
        throw new Error(`Validation failed: Public video URL is unreachable (${videoGet?.status})`);
      }
    }

    // 7c. Run ffprobe on output video container
    await new Promise<void>((resolve, reject) => {
      execFile('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1',
        outputVideoPath
      ], (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`ffprobe container check failed: ${stderr || err.message}`));
        } else {
          resolve();
        }
      });
    });

    const getDuration = async (filePath: string): Promise<number | null> => {
      return new Promise((resolve) => {
        execFile('ffprobe', [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          filePath
        ], (err, stdout) => {
          if (err || !stdout) resolve(null);
          else {
            const parsed = parseFloat(stdout.trim());
            resolve(isNaN(parsed) ? null : parsed);
          }
        });
      });
    };

    const audioDuration = await getDuration(outputAudioPath);
    const videoDuration = await getDuration(outputVideoPath);

    const generationTimeMs = Date.now() - startTime;

    // 8. Update database as completed
    const finalVideoUrl = publicVideoUrl.replace(/host\.docker\.internal/g, 'localhost');
    const finalAudioUrl = publicAudioUrl.replace(/host\.docker\.internal/g, 'localhost');

    await db.getSupabase().from('voiceover_clips').update({
      status: 'completed',
      video_path: finalVideoUrl,
      audio_path: finalAudioUrl,
      generation_time_ms: generationTimeMs,
      updated_at: new Date().toISOString()
    }).eq('id', vcId);

    // 8b. Log feedback data
    try {
      await db.getSupabase().from('voiceover_feedback').insert({
        voiceover_id: vcId,
        source_clip_id: vc.source_clip_id,
        provider: vc.provider,
        language: vc.metadata?.language || 'English',
        style: vc.metadata?.style || 'custom',
        script_mode: vc.script_mode || 'custom',
        script_length: vc.narration_text?.length || 0,
        audio_duration: audioDuration,
        video_duration: videoDuration,
        generation_time_ms: generationTimeMs
      });
      console.log(`[VoiceoverWorker]: Logged feedback metrics for ${vcId}.`);
    } catch (feedbackErr: any) {
      console.warn(`[VoiceoverWorker]: Failed to log feedback data for ${vcId}:`, feedbackErr.message);
    }

    console.log(`[VoiceoverWorker]: Voiceover ${vcId} completed successfully in ${generationTimeMs}ms.`);

    // Cleanup
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}

  } catch (error: any) {
    console.error(`[VoiceoverWorker]: Failed to process voiceover ${vcId}:`, error);
    await db.getSupabase().from('voiceover_clips').update({
      status: 'failed',
      error_message: error.message,
      updated_at: new Date().toISOString()
    }).eq('id', vcId);
  }
}

const pollForVoiceovers = async () => {
  console.log(`[VoiceoverWorker]: 🟢 Independent Polling started.`);
  while (!stopRequested) {
    try {
      // 1. Transactionally lock the next pending voiceover
      const { data, error } = await db.getSupabase()
        .rpc('claim_next_voiceover_clip');

      if (error && error.code !== 'PGRST204') {
        console.error(`[VoiceoverWorker]: Error claiming voiceover (RPC):`, error.message);
      }
      
      if (data && data.length > 0) {
        const vc = data[0];
        await processVoiceoverClip(vc);
      } else {
        // Fallback for simple fetching if RPC doesn't exist or returned nothing
        const { data: pending, error: fetchErr } = await db.getSupabase()
          .from('voiceover_clips')
          .select('*')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(1);

        if (pending && pending.length > 0) {
          const vc = pending[0];
          // Simple optimistic locking
          const { data: updated, error: updateErr } = await db.getSupabase()
            .from('voiceover_clips')
            .update({ status: 'processing', updated_at: new Date().toISOString() })
            .eq('id', vc.id)
            .eq('status', 'pending')
            .select();

          if (updated && updated.length > 0) {
            await processVoiceoverClip(updated[0]);
          }
        }
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (err: any) {
      console.error(`[VoiceoverWorker]: ❌ Error in polling loop:`, err.message);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  console.log(`[VoiceoverWorker]: 🛑 Stopped.`);
};

export const startWorker = async () => {
  if (isPolling) {
    console.log('[VoiceoverWorker]: Worker already running.');
    return;
  }
  isPolling = true;
  console.log(`[VoiceoverWorker]: 🚀 Starting VoiceoverWorker...`);
  
  await pollForVoiceovers();
  isPolling = false;
};

export const stopWorker = () => {
  stopRequested = true;
};

// Start if run directly
if (require.main === module) {
  startWorker().catch(err => {
    console.error('[VoiceoverWorker]: Fatal startup error:', err);
    process.exit(1);
  });
}
