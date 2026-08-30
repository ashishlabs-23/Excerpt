import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import dns from 'dns';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export function isPrivateIp(ip: string): boolean {
  // Regexes for RFC1918, Link-local, Loopback
  return (
    /^10\./.test(ip) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    ip === '::1' ||
    /^fc00:/.test(ip) ||
    /^fd/.test(ip) ||
    /^fe80:/.test(ip)
  );
}

export async function assertSsrfSafe(urlStr: string): Promise<void> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch (e) {
    throw new PipelineError(PipelineErrorCode.SsrfViolation, 'Invalid URL format');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new PipelineError(PipelineErrorCode.SsrfViolation, `Unsupported protocol: ${parsedUrl.protocol}`);
  }

  // Resolve hostname
  try {
    const { address } = await lookup(parsedUrl.hostname);
    if (isPrivateIp(address)) {
      throw new PipelineError(
        PipelineErrorCode.SsrfViolation,
        `URL resolves to private/reserved IP: ${address}`
      );
    }
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    throw new PipelineError(PipelineErrorCode.SsrfViolation, 'Failed to resolve hostname');
  }
}
