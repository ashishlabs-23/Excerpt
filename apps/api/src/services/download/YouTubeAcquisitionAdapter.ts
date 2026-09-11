import fs from 'fs';
import path from 'path';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { DownloadIntelligenceEngine } from './DownloadEngine';
import { DownloadAttempt } from './types';
import { withYtDlpCookies } from '../../lib/cookieHelper';

export interface AcquisitionCapabilities {
  hasCookies: boolean;
  hasProxy: boolean;
  hasPoToken: boolean;
  poToken?: string;
  clients: string[];
}

export interface AcquisitionResult {
  outputPath: string;
  strategyUsed: string;
  durationMs: number;
  fileSizeBytes: number;
  attempts: DownloadAttempt[];
}

export class YouTubeAcquisitionAdapter {
  private downloadEngine: DownloadIntelligenceEngine;

  constructor(downloadEngine?: DownloadIntelligenceEngine) {
    this.downloadEngine = downloadEngine || new DownloadIntelligenceEngine();
  }

  /**
   * Probes environment capabilities for YouTube extraction:
   * PO-Token, Cookies, Proxies, and supported player clients.
   */
  public probeCapabilities(): AcquisitionCapabilities {
    const poToken = process.env.YOUTUBE_PO_TOKEN || process.env.PO_TOKEN || undefined;
    const hasProxy = Boolean(
      process.env.HTTP_PROXY ||
      process.env.HTTPS_PROXY ||
      process.env.ROTATING_PROXY_URL ||
      process.env.PROXY_URL
    );

    let hasCookies = Boolean(process.env.YOUTUBE_COOKIES || process.env.COOKIES_CONTENT);
    if (!hasCookies) {
      const defaultCookiePath = path.join(process.cwd(), 'cookies.txt');
      if (fs.existsSync(defaultCookiePath) && fs.statSync(defaultCookiePath).size > 0) {
        hasCookies = true;
      }
    }

    const clients = ['ios', 'android_vr', 'web_embedded', 'tv', 'web', 'mweb'];

    return {
      hasCookies,
      hasProxy,
      hasPoToken: Boolean(poToken),
      poToken,
      clients,
    };
  }

  /**
   * Translates raw download and HTTP errors into canonical PipelineErrors.
   * Strictly distinguishes retryable rate limits (429) from capability failures (Bot Challenge, PO-Token, Private Video).
   */
  public classifyFailure(
    errorMsg: string,
    httpStatus?: number
  ): { code: PipelineErrorCode; retryable: boolean; reason: string; suggestedFix?: string } {
    const lower = (errorMsg || '').toLowerCase();
    const status = httpStatus || this.extractHttpStatus(errorMsg);

    // 1. Rate Limit (HTTP 429) -> Retryable with exponential backoff
    if (status === 429 || lower.includes('429') || lower.includes('too many requests')) {
      return {
        code: PipelineErrorCode.DownloadRateLimit,
        retryable: true,
        reason: 'YouTube rate limit reached (HTTP 429 / Too Many Requests).',
        suggestedFix: 'Back off request rate or route traffic through rotating residential proxy.',
      };
    }

    // 2. PO-Token Required -> Capability Failure (non-retryable without config)
    if (
      lower.includes('po token') ||
      lower.includes('po_token') ||
      lower.includes('proof of origin') ||
      lower.includes('visitordata') ||
      lower.includes('gds token required')
    ) {
      return {
        code: PipelineErrorCode.PoTokenRequired,
        retryable: false,
        reason: 'YouTube requires Proof-of-Origin (PO) token for playback extraction.',
        suggestedFix: 'Configure YOUTUBE_PO_TOKEN or generate visitorData PO token for yt-dlp.',
      };
    }

    // 3. Bot Challenge / Cloudflare / Google Block (HTTP 403) -> Capability Failure
    if (
      status === 403 ||
      lower.includes('sign in to confirm you') ||
      lower.includes('bot detection') ||
      lower.includes('bot verification') ||
      lower.includes('confirm you’re not a robot') ||
      lower.includes('confirm you\'re not a robot')
    ) {
      return {
        code: PipelineErrorCode.DownloadBotChallenge,
        retryable: false,
        reason: 'YouTube bot challenge encountered (HTTP 403 / Sign in required).',
        suggestedFix: 'Provide fresh authenticated session cookies or client PO-token.',
      };
    }

    // 4. Private / Deleted / Geo-blocked Video (HTTP 410 / 404) -> Permanent Failure
    if (
      status === 410 ||
      status === 404 ||
      lower.includes('private video') ||
      lower.includes('video unavailable') ||
      lower.includes('this video is private') ||
      lower.includes('account associated with this video has been terminated') ||
      lower.includes('video unavailable in your country')
    ) {
      return {
        code: PipelineErrorCode.DownloadPrivateVideo,
        retryable: false,
        reason: 'Video is private, removed, or unavailable.',
        suggestedFix: 'Verify the video URL is public and accessible in your region.',
      };
    }

    // 5. Default General Download Failure
    return {
      code: PipelineErrorCode.DownloadFailed,
      retryable: false,
      reason: errorMsg || 'All acquisition strategies failed.',
      suggestedFix: 'Check video URL and yt-dlp updates.',
    };
  }

  /**
   * Executes resilient video acquisition against YouTube.
   * Probes capabilities, executes strategies, and guarantees either a valid output or canonical PipelineError.
   */
  public async acquire(
    url: string,
    outputPath: string,
    onProgress?: (percent: number, speed?: string, eta?: string, strategy?: string) => void
  ): Promise<AcquisitionResult> {
    const startedAt = Date.now();
    const capabilities = this.probeCapabilities();

    console.log(`[YouTubeAcquisition]: 🎯 Probing acquisition for ${url} (hasCookies=${capabilities.hasCookies}, hasProxy=${capabilities.hasProxy}, hasPoToken=${capabilities.hasPoToken})...`);

    try {
      const result = await this.downloadEngine.executeDownload(
        url,
        outputPath,
        onProgress || (() => {})
      );

      // Verify downloaded artifact
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
        throw new Error(`Acquisition completed but output file is missing or empty at ${outputPath}`);
      }

      const fileSizeBytes = fs.statSync(outputPath).size;
      const durationMs = Date.now() - startedAt;
      const successfulAttempt = (result.attempts || []).find((a: any) => a.result === 'success' || a.success);
      const strategyUsed = successfulAttempt?.strategyId || 'direct-or-fallback';

      console.log(`[YouTubeAcquisition]: ✅ Acquisition successful via '${strategyUsed}' (${(fileSizeBytes / 1024 / 1024).toFixed(2)} MB in ${durationMs}ms)`);

      return {
        outputPath,
        strategyUsed,
        durationMs,
        fileSizeBytes,
        attempts: result.attempts,
      };
    } catch (err: any) {
      const rawMessage = err.message || String(err);
      const classification = this.classifyFailure(rawMessage);

      console.error(`[YouTubeAcquisition]: ❌ Acquisition failed with [${classification.code}] (retryable=${classification.retryable}): ${classification.reason}`);

      throw new PipelineError({
        code: classification.code,
        message: classification.reason,
        stage: 'acquisition',
        component: 'YouTubeAcquisitionAdapter',
        provider: 'yt-dlp',
        retryable: classification.retryable,
        suggestedFix: classification.suggestedFix,
        rootCause: rawMessage,
        metadata: {
          url,
          attempts: (err as any).attempts || [],
          capabilities,
        },
      });
    }
  }

  private extractHttpStatus(msg: string): number | undefined {
    const match = msg.match(/HTTP Error (\d+)/i) || msg.match(/status (\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }
}
