export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
export const MAX_DURATION_SECONDS = 4 * 60 * 60; // 4 Hours

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Validates URLs on the client-side, rejecting SSRF targets (private IPs, localhost)
 * and enforcing plausible media/YouTube URL formats.
 */
export function validateMediaUrl(urlStr: string): ValidationResult {
  if (!urlStr || !urlStr.trim()) {
    return { isValid: false, errorMessage: 'Please enter a valid video URL.' };
  }

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    // 1. Client-Side SSRF Guard (Private IPs & Localhost)
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      (host.startsWith('172.') && parseInt(host.split('.')[1], 10) >= 16 && parseInt(host.split('.')[1], 10) <= 31)
    ) {
      return {
        isValid: false,
        errorMessage: 'Security Block: Private IP and localhost URLs are restricted (SSRF Guard).'
      };
    }

    // 2. Plausible Host Check (YouTube or Direct Media)
    const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
    const isDirectMedia = parsed.pathname.endsWith('.mp4') || parsed.pathname.endsWith('.webm') || parsed.pathname.endsWith('.mov');

    if (!isYouTube && !isDirectMedia) {
      return {
        isValid: false,
        errorMessage: 'Unsupported URL. Please provide a YouTube link or direct video link (.mp4, .webm).'
      };
    }

    return { isValid: true };

  } catch (err) {
    return { isValid: false, errorMessage: 'Invalid URL structure. Ensure it includes http:// or https://' };
  }
}

/**
 * Validates local files before upload starts, surfacing size and audio-only constraints.
 */
export function validateLocalFile(file: File): ValidationResult {
  // 1. Audio-Only Rejection
  if (file.type.startsWith('audio/') || /\.(mp3|wav|aac|flac|m4a|ogg)$/i.test(file.name)) {
    return {
      isValid: false,
      errorMessage: 'Audio-only files are not supported. Please upload a video file containing a visual track.'
    };
  }

  // 2. Max File Size Guard (5 GB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeGB = (file.size / (1024 * 1024 * 1024)).toFixed(2);
    return {
      isValid: false,
      errorMessage: `File size (${sizeGB} GB) exceeds the maximum allowed limit of 5.00 GB.`
    };
  }

  return { isValid: true };
}
