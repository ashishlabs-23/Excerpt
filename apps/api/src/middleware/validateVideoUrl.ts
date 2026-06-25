import dns from 'dns/promises';
import { RequestHandler } from 'express';
import net from 'net';

export type VideoUrlValidationErrorCode =
  | 'missing_url'
  | 'invalid_url'
  | 'unsupported_protocol'
  | 'embedded_credentials'
  | 'hostname_not_allowed'
  | 'blocked_hostname'
  | 'blocked_port'
  | 'blocked_ip'
  | 'dns_lookup_failed'
  | 'dns_resolved_private_ip';

export type VideoUrlValidationResult =
  | {
      ok: true;
      url: string;
      hostname: string;
      resolvedAddresses: string[];
    }
  | {
      ok: false;
      code: VideoUrlValidationErrorCode;
      message: string;
    };

interface ValidateVideoUrlOptions {
  enforceHostAllowlist?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      validatedVideoUrl?: Extract<VideoUrlValidationResult, { ok: true }>;
    }
  }
}

const PLATFORM_HOSTS = [
  'youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'tiktok.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'vimeo.com',
  'supabase.co',
] as const;

const BLOCKED_HOSTNAMES = new Set([
  '0',
  'localhost',
  'ip6-localhost',
  'metadata.google.internal',
]);

function normalizeHostname(hostname: string) {
  return hostname.trim().replace(/\.$/, '').toLowerCase();
}

function failure(
  code: VideoUrlValidationErrorCode,
  message: string
): VideoUrlValidationResult {
  return { ok: false, code, message };
}

function isAllowedPlatformHost(hostname: string) {
  return PLATFORM_HOSTS.some((allowedHost) => (
    hostname === allowedHost || hostname.endsWith(`.${allowedHost}`)
  ));
}

function isBlockedHostname(hostname: string) {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  if (/^\d+$/.test(hostname)) return true;

  return (
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.lan')
  );
}

function parseIPv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  const parsed = parts.map((part) => {
    if (!/^\d+$/.test(part)) return NaN;
    const value = Number(part);
    return value >= 0 && value <= 255 ? value : NaN;
  });

  return parsed.some(Number.isNaN) ? null : parsed;
}

export function isBlockedIPv4(address: string) {
  const parts = parseIPv4(address);
  if (!parts) return true;

  const [a, b, c] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isBlockedIPv6(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;

  if (normalized.startsWith('::ffff:')) {
    const mappedIPv4 = normalized.slice('::ffff:'.length);
    if (net.isIP(mappedIPv4) === 4) {
      return isBlockedIPv4(mappedIPv4);
    }
  }

  const firstHextetText = normalized.split(':')[0] || '0';
  const firstHextet = parseInt(firstHextetText, 16);
  if (!Number.isFinite(firstHextet)) return true;

  return (
    (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    normalized.startsWith('2001:db8:') ||
    normalized === '2001:db8::' ||
    normalized.startsWith('ff')
  );
}

export function isBlockedIp(address: string) {
  const version = net.isIP(address);
  if (version === 4) return isBlockedIPv4(address);
  if (version === 6) return isBlockedIPv6(address);
  return true;
}

async function resolveHostname(hostname: string): Promise<string[] | VideoUrlValidationResult> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    const addresses = records.map((record) => record.address);

    if (addresses.length === 0) {
      return failure('dns_lookup_failed', 'The video hostname did not resolve.');
    }

    const blockedAddress = addresses.find((address) => isBlockedIp(address));
    if (blockedAddress) {
      return failure(
        'dns_resolved_private_ip',
        'The video hostname resolves to a private, loopback, or reserved IP address.'
      );
    }

    return addresses;
  } catch {
    return failure('dns_lookup_failed', 'The video hostname could not be resolved.');
  }
}

export async function validateVideoUrl(
  value: unknown,
  options: ValidateVideoUrlOptions = {}
): Promise<VideoUrlValidationResult> {
  const enforceHostAllowlist = options.enforceHostAllowlist !== false;

  if (typeof value !== 'string' || value.trim().length === 0) {
    return failure('missing_url', 'A videoUrl is required.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return failure('invalid_url', 'The videoUrl must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return failure('unsupported_protocol', 'Only HTTP and HTTPS video URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    return failure('embedded_credentials', 'Video URLs must not include embedded credentials.');
  }

  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return failure('blocked_port', 'Only default HTTP and HTTPS ports are allowed.');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || isBlockedHostname(hostname)) {
    return failure('blocked_hostname', 'This hostname is not allowed.');
  }

  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    return failure('blocked_ip', 'Private, loopback, and reserved IP addresses are not allowed.');
  }

  if (enforceHostAllowlist && !isAllowedPlatformHost(hostname)) {
    return failure(
      'hostname_not_allowed',
      'Only YouTube, TikTok, Instagram, Twitter/X, and Vimeo URLs are allowed.'
    );
  }

  const resolved = await resolveHostname(hostname);
  if (!Array.isArray(resolved)) {
    return resolved;
  }

  return {
    ok: true,
    url: parsed.toString(),
    hostname,
    resolvedAddresses: resolved,
  };
}

export const validateVideoUrlMiddleware: RequestHandler = async (req, res, next) => {
  const result = await validateVideoUrl(req.body?.videoUrl);

  if (!result.ok) {
    return res.status(400).json({ validation: result });
  }

  req.validatedVideoUrl = result;
  req.body.videoUrl = result.url;
  return next();
};
