import { ProxyProvider } from './types';

export class EnvProxyProvider implements ProxyProvider {
  getProxyUrl(): string | undefined {
    return process.env.YTDLP_PROXY || undefined;
  }
}
