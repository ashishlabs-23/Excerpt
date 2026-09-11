import { DownloadIntelligenceEngine } from './DownloadEngine';
import { YouTubeAcquisitionAdapter } from './YouTubeAcquisitionAdapter';
export * from './types';
export * from './DownloadEngine';
export * from './YouTubeAcquisitionAdapter';

export const downloadEngine = new DownloadIntelligenceEngine();
export const youTubeAcquisitionAdapter = new YouTubeAcquisitionAdapter(downloadEngine);
