import fs from 'fs';
import { execFile } from 'child_process';
import { getBinaryPath } from '../services/videoProcessor';

/**
 * Validates file header magic bytes to prevent polyglot script/executable uploads.
 */
export async function validateFileMagicBytes(filePath: string, expectedType: 'video' | 'audio'): Promise<boolean> {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  try {
    fs.readSync(fd, buffer, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }

  const hex = buffer.toString('hex').toLowerCase();

  if (expectedType === 'video') {
    // MP4/MOV: typically contain 'ftyp' at bytes 4-7
    const isMp4 = hex.substring(8, 16) === '66747970';
    // WebM (EBML): starts with 1a45dfa3
    const isWebm = hex.startsWith('1a45dfa3');
    // AVI: starts with RIFF and AVI 
    const isAvi = hex.startsWith('52494646') && hex.substring(16, 24) === '41564920';
    
    return isMp4 || isWebm || isAvi;
  } else {
    // MP3: starts with ID3 (494433) or starts with FF FB / FF F3 / FF F2
    const isMp3 = hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3') || hex.startsWith('fff2');
    // WAV: starts with RIFF (52494646) and WAVE (57415645) at offset 8
    const isWav = hex.startsWith('52494646') && hex.substring(16, 24) === '57415645';
    // M4A: ftypM4A at offset 4
    const isM4a = hex.substring(8, 22) === '667479706d3461';
    
    return isMp3 || isWav || isM4a;
  }
}

/**
 * Executes ffprobe to verify that the file is not corrupted and is a valid media file.
 */
export function getMediaDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    try {
      const ffprobe = getBinaryPath('ffprobe');
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath
      ];

      execFile(ffprobe, args, (err, stdout) => {
        if (err) {
          return reject(new Error(`ffprobe failed: ${err.message}`));
        }
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration) || duration <= 0) {
          return reject(new Error('Invalid media duration.'));
        }
        resolve(duration);
      });
    } catch (err: any) {
      reject(new Error(`ffprobe execution setup failed: ${err.message}`));
    }
  });
}

/**
 * Complete file verification (checks magic bytes and media integrity).
 */
export async function verifyUploadedMedia(filePath: string, expectedType: 'video' | 'audio'): Promise<{ valid: boolean; duration?: number; error?: string }> {
  try {
    const isValidMagic = await validateFileMagicBytes(filePath, expectedType);
    if (!isValidMagic) {
      return { valid: false, error: `Magic bytes mismatch. File is not a valid ${expectedType} file.` };
    }

    const duration = await getMediaDuration(filePath);
    return { valid: true, duration };
  } catch (error: any) {
    return { valid: false, error: error.message || 'Media integrity check failed.' };
  }
}
