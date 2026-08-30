import { MediaArtifact, PipelineError, PipelineErrorCode, ValidationWarning } from '@excerpt/clipping-core';

export const MINIMUM_DURATION_MS = 5000; // 5 seconds
export const SUPPORTED_VIDEO_CODECS = ['h264', 'vp9', 'av1', 'hevc'];

export class ValidationRules {
  static evaluate(artifact: MediaArtifact, probeData: any): { fatalErrors: PipelineError[], warnings: ValidationWarning[] } {
    const fatalErrors: PipelineError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Duration Rules
    if (artifact.durationMs === 0) {
      fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, 'Duration is 0'));
    } else if (artifact.durationMs < MINIMUM_DURATION_MS) {
      fatalErrors.push(new PipelineError(PipelineErrorCode.MinimumDurationNotMet, `Duration ${artifact.durationMs}ms is below minimum ${MINIMUM_DURATION_MS}ms`));
    }

    // 2. Codec Rules
    if (!artifact.videoCodec || !SUPPORTED_VIDEO_CODECS.includes(artifact.videoCodec.toLowerCase())) {
      fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, `Unsupported video codec: ${artifact.videoCodec}`));
    }

    // 3. Audio Stream Rules
    if (artifact.hasAudio && !artifact.audioCodec) {
       fatalErrors.push(new PipelineError(PipelineErrorCode.ValidationError, 'Audio stream expected but codec missing'));
    }

    // 4. VFR (Variable Frame Rate) Warning
    // ffprobe might output r_frame_rate as something like '30000/1001' or '30/1'
    // A heuristic for VFR is if avg_frame_rate != r_frame_rate, or if vfr is explicitly reported (some probes).
    // Let's assume probeData gives us avg_frame_rate and r_frame_rate.
    if (probeData && probeData.videoStream) {
      const v = probeData.videoStream;
      if (v.avg_frame_rate && v.r_frame_rate && v.avg_frame_rate !== v.r_frame_rate) {
        warnings.push({ code: 'VFR_DETECTED', message: 'Video appears to have a variable frame rate' });
      } else if (v.avg_frame_rate && v.avg_frame_rate === '0/0') {
         warnings.push({ code: 'VFR_DETECTED', message: 'Frame rate could not be reliably determined' });
      }
    }

    // 5. Resolution Warnings
    if (artifact.width && artifact.height) {
      const ratio = artifact.width / artifact.height;
      // If it's not exactly 16:9 or 9:16, add a warning
      const is169 = Math.abs(ratio - (16/9)) < 0.05;
      const is916 = Math.abs(ratio - (9/16)) < 0.05;
      if (!is169 && !is916) {
        warnings.push({ code: 'NON_STANDARD_ASPECT_RATIO', message: `Aspect ratio ${ratio.toFixed(2)} is non-standard` });
      }
    }

    return { fatalErrors, warnings };
  }
}
