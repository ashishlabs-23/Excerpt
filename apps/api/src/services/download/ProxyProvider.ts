import { ProxyProvider } from './types';

export class RotatingProxyProvider implements ProxyProvider {
  private currentIndex = 0;
  private failedProxies = new Map<string, number>(); // proxyUrl -> timestamp cooldown
  private readonly cooldownMs = 5 * 60 * 1000; // 5 minute backoff on blocked proxy

  private customPool?: string[];

  constructor(initialPool?: string[]) {
    if (initialPool && initialPool.length > 0) {
      this.customPool = initialPool;
    }
  }

  private getPool(): string[] {
    if (this.customPool && this.customPool.length > 0) {
      return this.customPool;
    }
    const rawList = process.env.YTDLP_PROXY_LIST || process.env.PROXY_POOL || process.env.YTDLP_PROXY || '';
    return rawList
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0 && (p.startsWith('http://') || p.startsWith('https://') || p.startsWith('socks5://')));
  }

  getProxyUrl(): string | undefined {
    const pool = this.getPool();
    if (pool.length === 0) return undefined;
    if (pool.length === 1) return pool[0];

    const now = Date.now();
    // Filter out proxies in active cooldown
    const activePool = pool.filter(proxy => {
      const cooldownUntil = this.failedProxies.get(proxy);
      if (!cooldownUntil) return true;
      if (now > cooldownUntil) {
        this.failedProxies.delete(proxy);
        return true;
      }
      return false;
    });

    const candidates = activePool.length > 0 ? activePool : pool;
    const selected = candidates[this.currentIndex % candidates.length];
    this.currentIndex = (this.currentIndex + 1) % candidates.length;
    return selected;
  }

  markFailed(proxyUrl: string): void {
    if (!proxyUrl) return;
    this.failedProxies.set(proxyUrl, Date.now() + this.cooldownMs);
    console.warn(`[ProxyProvider]: Placed proxy ${proxyUrl.replace(/:[^:@]+@/, ':***@')} into 5m cooldown.`);
  }
}

export class EnvProxyProvider extends RotatingProxyProvider {}
