import * as crypto from 'crypto';
import * as fs from 'fs';
import { PipelineError, PipelineErrorCode } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';

export class UploadIntegrity {
  constructor(private logger: Logger) {}

  /**
   * Compares the MD5 checksum of a local file against the remote ETag to catch transport corruption.
   */
  async verifyChecksum(localPath: string, remoteETag: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      const stream = fs.createReadStream(localPath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        const localHash = hash.digest('hex');
        
        // AWS S3 ETags for non-multipart uploads are the MD5 hex surrounded by quotes
        const normalizedETag = remoteETag.replace(/"/g, '');

        if (localHash === normalizedETag) {
          this.logger.info(`Upload integrity verified. Checksum matched: ${localHash}`);
          resolve(true);
        } else {
          this.logger.error(`Upload corruption detected. Local: ${localHash}, Remote: ${normalizedETag}`);
          reject(new PipelineError(PipelineErrorCode.ValidationError, 'Upload checksum mismatch. Possible transport corruption.'));
        }
      });

      stream.on('error', (err) => {
        reject(new PipelineError(PipelineErrorCode.ValidationError, `Failed to compute local checksum: ${err.message}`));
      });
    });
  }
}
