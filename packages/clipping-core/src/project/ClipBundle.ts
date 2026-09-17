/**
 * ClipBundle.ts — Canonical deliverable package contract for @excerpt/clipping-core.
 *
 * Defines the complete publication artifact bundle delivered to creators:
 *   - clip.mp4
 *   - preview.mp4
 *   - poster.jpg
 *   - captions.srt
 *   - captions.vtt
 *   - edit-project.json
 *   - metadata.json
 */

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
  predictedViralityScore?: number;
}

export interface ClipBundle {
  clipId: string;
  jobId: string;
  videoPath: string;           // clip.mp4 (Broadcast 1080x1920)
  previewPath?: string;        // preview.mp4 (Lightweight fast scrub)
  posterPath: string;          // poster.jpg (Cover frame)
  captionsSrtPath: string;     // captions.srt
  captionsVttPath: string;     // captions.vtt
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
  predictedViralityScore?: number;
}): ClipBundleMetadata {
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
    predictedViralityScore: params.predictedViralityScore,
  };
}
