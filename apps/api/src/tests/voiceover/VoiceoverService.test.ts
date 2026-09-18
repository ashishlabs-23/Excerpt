import {
  VoiceoverService,
  sanitizeNarrationText,
  VoiceConfig,
} from '../../services/VoiceoverService';

describe('VoiceoverService Subsystem', () => {
  const service = VoiceoverService.getInstance();

  describe('sanitizeNarrationText', () => {
    it('preserves whitelisted SSML tags', () => {
      const input = 'Hello <break time="300ms"/> world <emphasis level="strong">amazing</emphasis> <prosody rate="1.2">fast</prosody>';
      const sanitized = sanitizeNarrationText(input);
      expect(sanitized).toBe('Hello <break time="300ms"/> world <emphasis level="strong">amazing</emphasis> <prosody rate="1.2">fast</prosody>');
    });

    it('strips non-whitelisted HTML and script tags', () => {
      const input = 'Clean text <script>alert("xss")</script> <b>bold</b> <div>block</div>';
      const sanitized = sanitizeNarrationText(input);
      expect(sanitized).toBe('Clean text alert("xss") bold block');
    });

    it('strips dangerous injection characters while preserving sentence punctuation', () => {
      const input = 'Here {is} [some] test\\ text, with "valid" punctuation!';
      const sanitized = sanitizeNarrationText(input);
      expect(sanitized).toBe('Here is some test text, with "valid" punctuation!');
    });

    it('throws error on non-string or empty input', () => {
      expect(() => sanitizeNarrationText(null as any)).toThrow('Narration text must be a string.');
      expect(() => sanitizeNarrationText('')).toThrow('Narration text is empty after sanitization.');
      expect(() => sanitizeNarrationText('   ')).toThrow('Narration text is empty after sanitization.');
    });
  });

  describe('getCacheFilePath', () => {
    const configA: VoiceConfig = {
      provider: 'elevenlabs',
      voiceId: 'pNInz6obpgDQGcFmaJgB',
      speakingRate: 1.0,
      pitch: 0,
      excitement: 0.5,
      energy: 0.5,
      drama: 0.0,
    };

    it('produces deterministic hash for identical text and configuration', () => {
      const path1 = service.getCacheFilePath('Hello world', configA, 'elevenlabs');
      const path2 = service.getCacheFilePath('Hello world', configA, 'elevenlabs');
      expect(path1).toBe(path2);
    });

    it('produces distinct hash when speakingRate or emotion parameters mutate', () => {
      const configB: VoiceConfig = { ...configA, speakingRate: 1.25 };
      const configC: VoiceConfig = { ...configA, excitement: 0.9 };

      const pathA = service.getCacheFilePath('Hello world', configA, 'elevenlabs');
      const pathB = service.getCacheFilePath('Hello world', configB, 'elevenlabs');
      const pathC = service.getCacheFilePath('Hello world', configC, 'elevenlabs');

      expect(pathA).not.toBe(pathB);
      expect(pathA).not.toBe(pathC);
      expect(pathB).not.toBe(pathC);
    });

    it('produces distinct hash for different providers with identical config', () => {
      const pathEleven = service.getCacheFilePath('Hello world', configA, 'elevenlabs');
      const pathGoogle = service.getCacheFilePath('Hello world', configA, 'google');

      expect(pathEleven).not.toBe(pathGoogle);
    });
  });

  describe('getAvailableVoices', () => {
    it('returns curated Neural2 voices for google provider', async () => {
      const voices = await service.getAvailableVoices('google');
      expect(voices.length).toBeGreaterThan(5);
      expect(voices.some(v => v.id.includes('Neural2'))).toBe(true);
    });

    it('returns OpenAI voices for openai provider', async () => {
      const voices = await service.getAvailableVoices('openai');
      const voiceIds = voices.map(v => v.id);
      expect(voiceIds).toContain('onyx');
      expect(voiceIds).toContain('nova');
      expect(voiceIds).toContain('alloy');
    });

    it('returns standard voices for elevenlabs provider', async () => {
      const voices = await service.getAvailableVoices('elevenlabs');
      expect(voices.length).toBeGreaterThanOrEqual(5);
      expect(voices.some(v => v.id === 'pNInz6obpgDQGcFmaJgB')).toBe(true);
    });
  });
});
