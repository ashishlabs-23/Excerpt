import * as https from 'https';
import * as http from 'http';
import { Logger } from '@excerpt/shared';

export interface UploadedArtifact {
  id: string;
  url?: string;
  remoteUrl?: string;
  localPath: string;
  remoteETag?: string;
  [key: string]: any;
}

export class PlaybackValidator {
  constructor(private logger: Logger) {}

  /**
   * Performs a REAL network validation against the uploaded S3/GCS bucket artifact.
   * 1. Issues a HEAD request to confirm existence.
   * 2. Issues a GET request with Range: bytes=0-1024 to confirm 206 Partial Content (Seekability).
   * 3. Inspects the returned byte buffer mathematically for the MP4 'ftyp' atom.
   */
  async validateRemoteArtifact(artifactUrl: string): Promise<boolean> {
    this.logger.info(`[PlaybackValidator] Validating remote artifact: ${artifactUrl}`);
    
    try {
      // 1. Check HTTP HEAD
      const headStatus = await this.makeRequest('HEAD', artifactUrl);
      if (headStatus !== 200) {
        this.logger.error(`[PlaybackValidator] HEAD failed with status ${headStatus}`);
        return false;
      }

      // 2. Check Range Request (206 Partial Content) and fetch first 1024 bytes
      const { status, body } = await this.makeRangeRequest(artifactUrl, 0, 1024);
      if (status !== 206) {
        this.logger.error(`[PlaybackValidator] Range request failed with status ${status}. Bucket does not support seeking!`);
        return false;
      }

      // 3. Inspect the byte buffer for the MP4 'ftyp' atom
      // The ftyp atom usually appears at byte offset 4, length 4.
      const ftypString = body.toString('ascii', 4, 8);
      if (ftypString !== 'ftyp') {
        this.logger.error(`[PlaybackValidator] Corrupt artifact! MP4 'ftyp' header missing. Got: ${ftypString}`);
        return false;
      }

      this.logger.info(`[PlaybackValidator] Artifact passed rigorous remote validation.`);
      return true;

    } catch (e: any) {
      this.logger.error(`[PlaybackValidator] Network exception during validation: ${e.message}`);
      return false;
    }
  }

  async validate(artifact: UploadedArtifact): Promise<boolean> {
    const targetUrl = artifact.url || artifact.remoteUrl || '';
    const valid = await this.validateRemoteArtifact(targetUrl);
    if (!valid) {
      throw new Error(`Playback validation failed for artifact ${artifact.id}`);
    }
    return true;
  }

  private makeRequest(method: 'HEAD' | 'GET', urlStr: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(url, { method }, (res) => {
        resolve(res.statusCode || 500);
      });
      req.on('error', reject);
      req.end();
    });
  }

  private makeRangeRequest(urlStr: string, start: number, end: number): Promise<{status: number, body: Buffer}> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(url, {
        method: 'GET',
        headers: {
          'Range': `bytes=${start}-${end}`
        }
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 500,
            body: Buffer.concat(chunks)
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
  }
}
