import { assertSsrfSafe, isPrivateIp } from '../ssrf/ssrfGuard';
import { fetchSafe } from '../ssrf/fetchSafe';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import nock from 'nock';

describe('SSRF Guard', () => {
  describe('isPrivateIp', () => {
    it('returns true for RFC 1918 addresses', () => {
      expect(isPrivateIp('10.0.0.1')).toBe(true);
      expect(isPrivateIp('172.16.0.1')).toBe(true);
      expect(isPrivateIp('192.168.1.1')).toBe(true);
    });

    it('returns true for loopback and link-local', () => {
      expect(isPrivateIp('127.0.0.1')).toBe(true);
      expect(isPrivateIp('169.254.169.254')).toBe(true); // AWS Metadata IP
    });

    it('returns false for public IPs', () => {
      expect(isPrivateIp('8.8.8.8')).toBe(false);
      expect(isPrivateIp('1.1.1.1')).toBe(false);
    });
  });

  describe('assertSsrfSafe', () => {
    it('T1: private-IP URL rejected before any request', async () => {
      await expect(assertSsrfSafe('http://169.254.169.254/latest/meta-data/')).rejects.toMatchObject({
        code: PipelineErrorCode.SsrfViolation,
      });

      await expect(assertSsrfSafe('http://127.0.0.1/admin')).rejects.toMatchObject({
        code: PipelineErrorCode.SsrfViolation,
      });

      // localhost will resolve to 127.0.0.1
      await expect(assertSsrfSafe('http://localhost/admin')).rejects.toMatchObject({
        code: PipelineErrorCode.SsrfViolation,
      });
    });
  });

  describe('fetchSafe', () => {
    afterEach(() => {
      nock.cleanAll();
    });

    it('T2: redirect chain to private IP rejected mid-chain', async () => {
      // Allow nock to intercept these requests
      const publicScope = nock('http://example.com')
        .get('/redirect')
        .reply(302, undefined, {
          Location: 'http://169.254.169.254/metadata'
        });

      await expect(fetchSafe('http://example.com/redirect')).rejects.toMatchObject({
        code: PipelineErrorCode.SsrfViolation,
      });
      
      expect(publicScope.isDone()).toBe(true);
    });

    it('succeeds for public redirect chain', async () => {
      nock('http://example.com')
        .get('/redirect')
        .reply(302, undefined, {
          Location: 'http://google.com'
        });
        
      nock('http://google.com')
        .get('/')
        .reply(200, 'Success');

      const result = await fetchSafe('http://example.com/redirect');
      expect(result).toBe('Success');
    });
  });
});
