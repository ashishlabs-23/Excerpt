export function mapDbClipsToResult(clips: any[] = []) {
  return clips
    .filter(clip => clip && (clip.status === 'uploaded' || Boolean(clip.video_url || clip.video_file || clip.storage_path)))
    .map((clip) => ({
      id: clip.id,
      job_id: clip.job_id || clip.jobId,
      video_file: clip.video_url || clip.video_file || clip.storage_path,
      video_url: clip.video_url || clip.video_file || clip.storage_path,
      thumbnail: clip.thumbnail_url || clip.thumbnail || clip.thumbnail_file || clip.storage_path,
      thumbnail_file: clip.thumbnail_url || clip.thumbnail || clip.thumbnail_file || clip.storage_path,
      title: clip.title || clip.metadata?.title || 'Generated Short',
      caption: clip.caption || clip.content || clip.metadata?.caption || 'AI Generated Clip',
      content: clip.content || clip.caption || clip.metadata?.caption || 'AI Generated Clip',
      start_time: typeof clip.start_time === 'number' ? clip.start_time : (clip.startTime || 0),
      end_time: typeof clip.end_time === 'number' ? clip.end_time : (clip.endTime || 60),
      metadata: clip.metadata,
      status: clip.status || 'uploaded',
    }));
}

export function hydrateJobStatusFromDb(dbJob: any) {
  const payload =
    dbJob?.payload && typeof dbJob.payload === 'object' ? dbJob.payload : {};

  // First check if dbJob.clips has rendered clips
  const uploadedClips = mapDbClipsToResult(dbJob?.clips || []);

  let result: any[] = [];
  if (uploadedClips.length > 0) {
    result = uploadedClips;
  } else if (Array.isArray(dbJob?.result) && dbJob.result.length > 0) {
    // Only use dbJob.result if it contains actual rendered clips
    const valid = mapDbClipsToResult(dbJob.result);
    result = valid.length > 0 ? valid : (dbJob.status === 'completed' ? [] : dbJob.result);
  } else if (Array.isArray(payload.result) && payload.result.length > 0) {
    const valid = mapDbClipsToResult(payload.result);
    result = valid.length > 0 ? valid : (dbJob.status === 'completed' ? [] : payload.result);
  }

  return {
    ...dbJob,
    result,
    generationMode: payload.generation_mode || dbJob.generation_mode,
    recoveryMode: payload.recovery_mode || dbJob.recovery_mode || dbJob.recoveryMode,
    recoveryReason: payload.recovery_reason || dbJob.recovery_reason || dbJob.recoveryReason,
    failedReason: dbJob.failed_reason || dbJob.failedReason,
    pipeline_summary: payload.pipeline_summary || dbJob.pipeline_summary,
    debug_data: payload.debug_data || dbJob.debug_data,
  };
}
