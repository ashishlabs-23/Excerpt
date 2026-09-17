/**
 * ClipBundle.ts — Canonical deliverable package contract for @excerpt/clipping-core.
 *
 * Defines the complete publication artifact bundle delivered to creators:
 *   - clip.mp4 (captioned)
 *   - clip-clean.mp4 (pristine)
 *   - poster.jpg (thumbnail)
 *   - edit-project.json (ClipProject)
 *   - metadata.json (ClipBundleMetadata)
 */

export interface EditorialScoreFactors {
  hook: number;         // 0.0 to 1.0
  completeness: number; // 0.0 to 1.0
  visual: number;       // 0.0 to 1.0
  speaker: number;      // 0.0 to 1.0
  retentionRisk?: number; // 0.0 to 1.0
}

export interface EditorialEvaluation {
  selectionScore: number; // 0.0 to 1.0
  confidence: number;     // 0.0 to 1.0
  qualityScore?: number;  // 0.0 to 1.0
  factors: EditorialScoreFactors;
}

export interface ClipBundleMetadata {
  titleCandidates: string[];
  description: string;
  hashtags: string[];
  source: {
    videoId: string;
    start: number;
    end: number;
  };
  contentWarnings?: string[];
  language: string;
  editorialEvaluation: EditorialEvaluation;
}

export interface ClipBundle {
  clipId: string;
  jobId: string;
  videoPath: string;           // clip.mp4 (Broadcast 1080x1920)
  cleanVideoPath?: string;     // clip-clean.mp4 (Pristine without burned titles)
  previewPath?: string;        // preview.mp4 (Lightweight fast scrub)
  posterPath: string;          // poster.jpg (Cover frame)
  captionsSrtPath?: string;    // captions.srt
  captionsVttPath?: string;    // captions.vtt
  projectJsonPath: string;     // edit-project.json
  metadataJsonPath: string;    // metadata.json
  metadata: ClipBundleMetadata;
}

export function compileClipBundleMetadata(params: {
  titleCandidates: string[];
  description: string;
  hashtags: string[];
  videoId: string;
  start: number;
  end: number;
  language?: string;
  selectionScore?: number;
  confidence?: number;
  scoreFactors?: Partial<EditorialScoreFactors>;
}): ClipBundleMetadata {
  const selectionScore = params.selectionScore !== undefined
    ? Number(Math.min(1.0, Math.max(0.0, params.selectionScore > 1 ? params.selectionScore / 100 : params.selectionScore)).toFixed(3))
    : 0.85;

  const confidence = params.confidence !== undefined
    ? Number(Math.min(1.0, Math.max(0.0, params.confidence > 1 ? params.confidence / 100 : params.confidence)).toFixed(3))
    : 0.80;

  const factors: EditorialScoreFactors = {
    hook: params.scoreFactors?.hook ?? 0.85,
    completeness: params.scoreFactors?.completeness ?? 0.88,
    visual: params.scoreFactors?.visual ?? 0.80,
    speaker: params.scoreFactors?.speaker ?? 0.85,
    retentionRisk: params.scoreFactors?.retentionRisk ?? 0.15,
  };

  return {
    titleCandidates: params.titleCandidates,
    description: params.description,
    hashtags: params.hashtags.map(h => h.startsWith('#') ? h : `#${h}`),
    source: {
      videoId: params.videoId,
      start: Number(params.start.toFixed(2)),
      end: Number(params.end.toFixed(2)),
    },
    language: params.language || 'en',
    editorialEvaluation: {
      selectionScore,
      confidence,
      qualityScore: selectionScore,
      factors,
    },
  };
}
