/**
 * FormatResolver: Deterministic Format Policy & Resolution Classification
 *
 * Invariants:
 * 1. Never silently choose 360p when >=720p formats exist in the source catalog.
 * 2. If source maximum resolution is <720p, classify as LOW_SOURCE_RESOLUTION.
 * 3. Prefer >=1080p when available, else prefer >=720p.
 * 4. Separate acquisition transport from format selection logic.
 */

export interface SourceFormatMetadata {
  format_id: string;
  ext?: string;
  height?: number | null;
  width?: number | null;
  vcodec?: string | null;
  acodec?: string | null;
  tbr?: number | null;
  protocol?: string | null;
  format_note?: string;
}

export interface FormatResolutionResult {
  selector: string;
  targetHeight: number;
  isLowResolutionSource: boolean;
  maxAvailableHeight: number;
  preferredFormatId?: string;
  hasHdCapability: boolean;
  reason: string;
}

export interface SelectedMediaTelemetry {
  selectedHeight: number;
  selectedWidth: number;
  selectedVideoCodec: string;
  selectedAudioCodec: string;
  selectedFormatId: string;
  ytDlpVersion: string;
  acquisitionStrategy: string;
  isLowResolutionSource: boolean;
}

export class FormatResolver {
  /**
   * Evaluates available format descriptors from source metadata and returns
   * the optimal yt-dlp format selector string and resolution classification.
   */
  public static resolve(
    formats: SourceFormatMetadata[] = [],
    resolutionCap: number = 1080
  ): FormatResolutionResult {
    // Filter video-bearing formats
    const videoFormats = formats.filter((f) => {
      const hasVcodec = f.vcodec && f.vcodec !== 'none';
      const hasHeight = typeof f.height === 'number' && f.height > 0;
      return hasVcodec || hasHeight;
    });

    const heights = videoFormats
      .map((f) => f.height || 0)
      .filter((h) => h > 0);

    const maxAvailableHeight = heights.length > 0 ? Math.max(...heights) : 0;
    const has1080p = maxAvailableHeight >= 1080;
    const has720p = maxAvailableHeight >= 720;
    const isLowResolution = maxAvailableHeight > 0 && maxAvailableHeight < 720;

    // Case 1: Catalog has >= 1080p
    if (has1080p && resolutionCap >= 1080) {
      const selector = [
        'bestvideo[height<=1080][height>=1080][ext=mp4]+bestaudio[ext=m4a]',
        'bestvideo[height<=1080][height>=1080]+bestaudio',
        'best[protocol^=m3u8][height<=1080][height>=1080]',
        'bestvideo[height<=1080][height>=720]+bestaudio',
        'best[height<=1080][height>=720]',
      ].join('/');

      return {
        selector,
        targetHeight: 1080,
        isLowResolutionSource: false,
        maxAvailableHeight,
        hasHdCapability: true,
        reason: '1080p stream prioritized from source catalog',
      };
    }

    // Case 2: Catalog has >= 720p but < 1080p (or capped at 720p)
    if (has720p) {
      const cap = Math.min(resolutionCap, 1080);
      const selector = [
        `bestvideo[height<=${cap}][height>=720][ext=mp4]+bestaudio[ext=m4a]`,
        `bestvideo[height<=${cap}][height>=720]+bestaudio`,
        `best[protocol^=m3u8][height<=${cap}][height>=720]`,
        `best[height<=${cap}][height>=720]`,
      ].join('/');

      return {
        selector,
        targetHeight: Math.min(maxAvailableHeight, cap),
        isLowResolutionSource: false,
        maxAvailableHeight,
        hasHdCapability: true,
        reason: '720p HD stream prioritized from source catalog',
      };
    }

    // Case 3: Genuine low-resolution source (e.g. 480p or 360p native upload)
    if (isLowResolution) {
      const selector = [
        `bestvideo[height<=${maxAvailableHeight}]+bestaudio`,
        `best[height<=${maxAvailableHeight}]`,
        'best',
      ].join('/');

      return {
        selector,
        targetHeight: maxAvailableHeight,
        isLowResolutionSource: true,
        maxAvailableHeight,
        hasHdCapability: false,
        reason: `Source catalog only provides max ${maxAvailableHeight}p (LOW_SOURCE_RESOLUTION)`,
      };
    }

    // Fallback if format probing didn't return heights: enforce HD floor first, then best
    const cap = Math.min(resolutionCap, 1080);
    const defaultSelector = [
      `bestvideo[height<=${cap}][height>=1080]+bestaudio`,
      `bestvideo[height<=${cap}][height>=720]+bestaudio`,
      `best[protocol^=m3u8][height<=${cap}][height>=720]`,
      `best[height<=${cap}][height>=720]`,
      `bestvideo[height<=${cap}][height>=480]+bestaudio`,
      `best[height<=${cap}][height>=480]`,
    ].join('/');

    return {
      selector: defaultSelector,
      targetHeight: 1080,
      isLowResolutionSource: false,
      maxAvailableHeight: 1080,
      hasHdCapability: true,
      reason: 'Standard HD fallback selector with 720p minimum floor',
    };
  }

  /**
   * Validates that the downloaded file meets quality criteria.
   * Throws an error if the source video has HD capability but a degraded (<720p) file was downloaded.
   */
  public static validateDownloadedResolution(
    actualHeight: number,
    resolutionResult: FormatResolutionResult
  ): void {
    if (resolutionResult.hasHdCapability && actualHeight < 720) {
      throw new Error(
        `[FormatResolver]: Quality floor violation. Catalog provides ${resolutionResult.maxAvailableHeight}p, ` +
        `but downloaded file is only ${actualHeight}p. Rejecting degraded format.`
      );
    }
  }
}
