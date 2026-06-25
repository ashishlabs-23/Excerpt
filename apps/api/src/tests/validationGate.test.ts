import { validateClip } from '../services/clipValidator';

describe('Clip Quality Validation Gate', () => {
  const createValidClip = () => ({
    id: 'test-clip-1',
    title: 'Valid Viral Highlight Title',
    thumbnail_url: 'https://storage.googleapis.com/thumb.jpg',
    metadata: {
      description: 'This is a valid long description that exceeds fifty characters of length to satisfy checks.',
      clip_score: 85,
      generation_mode: 'ai',
      words: [{ word: 'hello', start: 0, end: 1 }],
      output_validation: {
        subtitles: { exists: true, size: 120 }
      }
    }
  });

  it('passes a fully compliant clip', () => {
    const clip = createValidClip();
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(true);
    expect(result.validation_status).toBe('passed');
    expect(result.analysis_status).toBe('completed');
    expect(result.errors).toHaveLength(0);
  });

  it('fails clip if title is too short', () => {
    const clip = createValidClip();
    clip.title = 'Short';
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Title must be longer than 10 characters');
  });

  it('fails clip if description is too short', () => {
    const clip = createValidClip();
    clip.metadata.description = 'Short description';
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Description must be longer than 50 characters');
  });

  it('fails clip if subtitles file is missing or empty', () => {
    const clip = createValidClip();
    clip.metadata.output_validation.subtitles = { exists: false, size: 0 };
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Captions/Subtitles file or word tokens missing');
  });

  it('fails clip if word tokens are missing', () => {
    const clip = createValidClip();
    clip.metadata.words = [];
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Captions/Subtitles file or word tokens missing');
  });

  it('fails clip if thumbnail is missing', () => {
    const clip = createValidClip();
    clip.thumbnail_url = '';
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Thumbnail image missing');
  });

  it('fails clip if ranking score is missing', () => {
    const clip = createValidClip();
    delete (clip.metadata as any).clip_score;
    const result = validateClip(clip, 'ai');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Ranking/virality scoring is missing');
  });

  it('fails clip if pipeline fell back to recovery or heuristic mode', () => {
    const clip = createValidClip();
    clip.metadata.generation_mode = 'recovery';
    const result = validateClip(clip, 'recovery');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('AI services were unavailable or fell back to recovery/heuristic mode');
  });
});
