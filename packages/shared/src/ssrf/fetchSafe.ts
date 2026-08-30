import http from 'http';
import https from 'https';
import { assertSsrfSafe } from './ssrfGuard';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';

/**
 * A safe fetch wrapper that validates every hop in a redirect chain
 * against the SSRF deny-list.
 */
export async function fetchSafe(url: string, maxRedirects = 5): Promise<string> {
  let currentUrl = url;
  
  for (let i = 0; i <= maxRedirects; i++) {
    // Validate current URL before any network request
    await assertSsrfSafe(currentUrl);
    
    const parsedUrl = new URL(currentUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const req = client.get(currentUrl, (res) => {
        resolve(res);
      });
      req.on('error', reject);
    });

    if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      // It's a redirect. Validate the next hop.
      const redirectUrl = new URL(response.headers.location, currentUrl).toString();
      currentUrl = redirectUrl;
      continue;
    }

    if (response.statusCode && response.statusCode >= 400) {
      throw new Error(`HTTP error ${response.statusCode}`);
    }

    // Success, read body
    let data = '';
    for await (const chunk of response) {
      data += chunk;
    }
    return data;
  }
  
  throw new PipelineError(PipelineErrorCode.SsrfViolation, 'Too many redirects');
}
