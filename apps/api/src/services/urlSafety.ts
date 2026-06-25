import { validateVideoUrl } from '../middleware/validateVideoUrl';
import https from 'https';
import http from 'http';
import net from 'net';
import { URL } from 'url';
import { Readable } from 'stream';

export class UnsafeRemoteUrlError extends Error {
  statusCode = 400;
  code: string;

  constructor(message: string, code = 'invalid_video_url') {
    super(message);
    this.name = 'UnsafeRemoteUrlError';
    this.code = code;
  }
}

export async function assertSafeRemoteVideoUrl(
  value: unknown,
  options: { enforceHostPolicy?: boolean } = {}
): Promise<string> {
  const result = await validateVideoUrl(value, {
    enforceHostAllowlist: options.enforceHostPolicy !== false,
  });

  if (!result.ok) {
    const failed = result as { ok: false; message: string; code: string };
    throw new UnsafeRemoteUrlError(failed.message, failed.code);
  }

  return result.url;
}

export async function fetchSecurely(
  urlStr: string,
  options: { enforceHostPolicy?: boolean; signal?: AbortSignal } = {}
): Promise<{
  statusCode?: number;
  statusText?: string;
  headers: Record<string, string>;
  body: Readable;
}> {
  const result = await validateVideoUrl(urlStr, {
    enforceHostAllowlist: options.enforceHostPolicy !== false,
  });

  if (!result.ok) {
    const failed = result as { ok: false; message: string; code: string };
    throw new UnsafeRemoteUrlError(failed.message, failed.code);
  }

  const resolvedIp = result.resolvedAddresses[0];
  if (!resolvedIp) {
    throw new Error('No IP address resolved for the safe URL.');
  }

  const parsedUrl = new URL(result.url);
  const lib = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.get(
      result.url,
      {
        headers: {
          'Host': parsedUrl.hostname,
          'User-Agent': 'Mozilla/5.0 Excerpt',
        },
        signal: options.signal,
        lookup: (hostname: string, opt: any, callback: any) => {
          // Detect IPv4 vs IPv6 dynamically to avoid ERR_INVALID_IP_ADDRESS
          const ipFamily = net.isIP(resolvedIp) === 6 ? 6 : 4;
          callback(null, resolvedIp, ipFamily); // Pin DNS lookup to the pre-validated IP
        },
      },
      (res) => {
        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(res.headers)) {
          if (val !== undefined) {
            headers[key] = Array.isArray(val) ? val.join(', ') : val;
          }
        }

        resolve({
          statusCode: res.statusCode,
          statusText: res.statusMessage,
          headers,
          body: res,
        });
      }
    );

    req.on('error', (err) => {
      reject(err);
    });
  });
}
