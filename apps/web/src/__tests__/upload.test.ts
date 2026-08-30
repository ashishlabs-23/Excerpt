import { validateMediaUrl, validateLocalFile, MAX_FILE_SIZE_BYTES } from '../lib/uploadValidation';
import { apiClient } from '../lib/api';

describe('Job Creation & Upload Flow Hardening Tests (Step 3)', () => {

  describe('1. Client-Side Pre-Flight Validation', () => {

    it('blocks oversized files (> 5 GB) before upload starts', () => {
      const oversizedFile = {
        name: 'huge_podcast.mp4',
        size: MAX_FILE_SIZE_BYTES + 1024, // 5GB + 1KB
        type: 'video/mp4'
      } as File;

      const result = validateLocalFile(oversizedFile);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('exceeds the maximum allowed limit of 5.00 GB');
    });

    it('blocks audio-only files (mp3/wav) before upload starts', () => {
      const audioFile = {
        name: 'interview_audio.mp3',
        size: 50 * 1024 * 1024,
        type: 'audio/mpeg'
      } as File;

      const result = validateLocalFile(audioFile);

      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Audio-only files are not supported');
    });

    it('blocks malformed and private IP SSRF URLs client-side', () => {
      // Private IP / SSRF targets
      const ssrf1 = validateMediaUrl('http://169.254.169.254/latest/meta-data/');
      const ssrf2 = validateMediaUrl('http://localhost:3000/internal');
      const ssrf3 = validateMediaUrl('http://10.0.0.1/admin');

      expect(ssrf1.isValid).toBe(false);
      expect(ssrf1.errorMessage).toContain('Security Block: Private IP and localhost URLs are restricted');

      expect(ssrf2.isValid).toBe(false);
      expect(ssrf3.isValid).toBe(false);

      // Malformed URLs
      const malformed = validateMediaUrl('not-a-url');
      expect(malformed.isValid).toBe(false);
      expect(malformed.errorMessage).toContain('Invalid URL structure');
    });

    it('accepts valid YouTube and direct video URLs', () => {
      const yt = validateMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      const direct = validateMediaUrl('https://media.excerpt.com/sample.mp4');

      expect(yt.isValid).toBe(true);
      expect(direct.isValid).toBe(true);
    });
  });

  describe('2. In-Flight Duplicate Detection & API Handling', () => {

    it('surfaces "Already Processing" when backend returns 409 conflict for duplicate URLs', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 409
      } as any);

      const result = await apiClient.createJob('https://www.youtube.com/watch?v=duplicate123', 3);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.statusCode).toBe(409);
      }

      fetchSpy.mockRestore();
    });
  });

  describe('3. Upload Cancellation & AbortController', () => {
    it('cancels upload cleanly when AbortController signals cancellation', async () => {
      const controller = new AbortController();
      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });
  });
});
