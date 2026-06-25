export interface ClipValidationResult {
  passed: boolean;
  validation_status: 'passed' | 'failed_validation';
  analysis_status: 'completed' | 'failed';
  errors: string[];
}

export function validateClip(clip: any, generationMode: string): ClipValidationResult {
  const errors: string[] = [];
  const titleStr = clip.title || '';
  const descStr = clip.metadata?.description || clip.metadata?.summary || '';
  const srtValidation = clip.metadata?.output_validation?.subtitles;
  const hasSrt = srtValidation?.exists && srtValidation?.size > 0;
  const isRecoveryClip = clip.metadata?.generation_mode === 'recovery' || clip.metadata?.generation_mode === 'heuristic';

  // Check 1: Title exists & len(title) > 10
  if (titleStr.trim().length <= 10) {
    errors.push('Title must be longer than 10 characters');
  }

  // Check 2: Description exists & len(description) > 50
  if (descStr.trim().length <= 50) {
    errors.push('Description must be longer than 50 characters');
  }

  // Check 3: Captions generated & srt_file_exists
  const hasCaptions = hasSrt && Array.isArray(clip.metadata?.words) && clip.metadata.words.length > 0;
  if (!hasCaptions) {
    errors.push('Captions/Subtitles file or word tokens missing');
  }

  // Check 4: AI analysis completed (not fallback/recovery)
  const isAiCompleted = !isRecoveryClip && generationMode === 'ai';
  if (!isAiCompleted) {
    errors.push(`AI services were unavailable or fell back to recovery/heuristic mode`);
  }

  // Check 5: Thumbnail exists
  const hasThumbnail = 
    (clip.thumbnail_url && clip.thumbnail_url.trim().length > 0) || 
    (clip.thumbnail_file && clip.thumbnail_file.trim().length > 0) || 
    (clip.thumbnail_storage_path && clip.thumbnail_storage_path.trim().length > 0);
  if (!hasThumbnail) {
    errors.push('Thumbnail image missing');
  }

  // Check 6: Ranking completed (ranking_score != null)
  const hasRanking = clip.metadata?.clip_score !== undefined && clip.metadata?.clip_score !== null;
  if (!hasRanking) {
    errors.push('Ranking/virality scoring is missing');
  }

  const passed = errors.length === 0;

  return {
    passed,
    validation_status: passed ? 'passed' : 'failed_validation',
    analysis_status: passed ? 'completed' : 'failed',
    errors,
  };
}
