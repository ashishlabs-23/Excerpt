import { InputAdapterConfig, MediaArtifact, MediaSource } from '@excerpt/clipping-core';
import { Logger } from '@excerpt/shared';
import { YouTubeAdapter } from './adapters/YouTubeAdapter';
import { DirectMediaAdapter } from './adapters/DirectMediaAdapter';
import { LocalFileAdapter } from './adapters/LocalFileAdapter';

export class InputGateway {
  private youtubeAdapter = new YouTubeAdapter();
  private directMediaAdapter = new DirectMediaAdapter();
  private localFileAdapter = new LocalFileAdapter();

  async acquire(source: MediaSource, config: InputAdapterConfig, logger: Logger): Promise<MediaArtifact> {
    switch (source.type) {
      case 'youtube':
        return this.youtubeAdapter.acquire(source, config, logger);
      case 'direct':
        return this.directMediaAdapter.acquire(source, config, logger);
      case 'local':
        return this.localFileAdapter.acquire(source, config, logger);
      default:
        // Ensures exhaustiveness
        const _exhaustiveCheck: never = source.type;
        throw new Error(`Unsupported source type`);
    }
  }
}
