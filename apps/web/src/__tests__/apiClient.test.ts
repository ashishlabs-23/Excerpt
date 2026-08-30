import { ExcerptApiClient } from '../lib/api';

describe('Typed API Client Discriminated Union Tests', () => {
  let client: ExcerptApiClient;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    client = new ExcerptApiClient('http://test-api/api');
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. exercises 200 OK success path', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'job-123', status: 'completed' })
    } as any);

    const result = await client.getJob('job-123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('job-123');
    }
  });

  it('2. exercises 401/403 Auth & RLS Denial error path', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403
    } as any);

    const result = await client.getJob('job-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('AUTH_RLS_DENIED');
      expect(result.error.statusCode).toBe(403);
    }
  });

  it('3. exercises 500 Network & Server Failure error path', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await client.getJob('job-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('NETWORK_ERROR');
      expect(result.error.message).toContain('Failed to fetch');
    }
  });

  it('4. exercises Malformed Response error path', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); }
    } as any);

    const result = await client.getJob('job-123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('UNKNOWN');
    }
  });
});
