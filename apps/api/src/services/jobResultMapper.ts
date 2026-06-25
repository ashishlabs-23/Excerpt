export function mapDbClipsToResult(clips: any[] = []) {
  return clips
    .filter(clip => clip.status === 'uploaded')
    .map((clip) => ({
      id: clip.id,
      job_id: clip.job_id,
      video_file: clip.video_url,
      video_url: clip.video_url,
      thumbnail: clip.thumbnail_url,
      thumbnail_file: clip.thumbnail_url,
      title: clip.title || clip.metadata?.title,
      caption: clip.caption || clip.content,
      content: clip.content || clip.caption,
      start_time: clip.start_time,
      end_time: clip.end_time,
      metadata: clip.metadata,
      status: clip.status
    }));
}

export function hydrateJobStatusFromDb(dbJob: any) {
  const payload =
    dbJob?.payload && typeof dbJob.payload === 'object' ? dbJob.payload : {};

  const result =
    Array.isArray(dbJob?.result) && dbJob.result.length > 0
      ? dbJob.result
      : Array.isArray(payload.result) && payload.result.length > 0
        ? payload.result
        : mapDbClipsToResult(dbJob?.clips || []);

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
