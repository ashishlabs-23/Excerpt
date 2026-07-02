import { DownloadStrategy } from './types';

const DEFAULT_STRATEGIES: DownloadStrategy[] = [
  {
    id: 'web-cookies',
    resolutionCap: '1080',
    extractorArgs: 'youtube:player_client=web',
    useCookies: true,
    maxRetries: 2,
    rateLimit: '25M'
  },
  {
    id: 'tv-cookies',
    resolutionCap: '1080',
    extractorArgs: 'youtube:player_client=tv',
    useCookies: true,
    maxRetries: 1,
    rateLimit: '25M'
  },
  {
    id: 'ios',
    resolutionCap: '1080',
    extractorArgs: 'youtube:player_client=ios',
    useCookies: false,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    maxRetries: 1,
    rateLimit: '15M'
  },
  {
    id: 'android',
    resolutionCap: '720',
    extractorArgs: 'youtube:player_client=android',
    useCookies: false, 
    userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
    maxRetries: 1,
    rateLimit: '10M'
  }
];

interface StrategyStats {
  attempts: number;
  successes: number;
}

export class LearningEngine {
  private stats: Record<string, StrategyStats> = {};

  constructor() {
    // Initialize stats
    for (const s of DEFAULT_STRATEGIES) {
      this.stats[s.id] = { attempts: 0, successes: 0 };
    }
  }

  public recordAttempt(strategyId: string, success: boolean) {
    if (!this.stats[strategyId]) {
      this.stats[strategyId] = { attempts: 0, successes: 0 };
    }
    this.stats[strategyId].attempts++;
    if (success) {
      this.stats[strategyId].successes++;
    }
  }

  public getSuccessRate(strategyId: string): number {
    const stat = this.stats[strategyId];
    if (!stat || stat.attempts === 0) return 1.0; // Assume 100% until proven otherwise
    return stat.successes / stat.attempts;
  }
}

export class StrategyManager {
  private learningEngine = new LearningEngine();
  private strategies = [...DEFAULT_STRATEGIES];

  public getStrategiesForVideo(durationSeconds?: number | null): DownloadStrategy[] {
    let activeStrategies = [...this.strategies];

    // Cap at 720p if > 1 hour
    if (durationSeconds && durationSeconds > 3600) {
      activeStrategies = activeStrategies.map(s => ({ ...s, resolutionCap: '720' }));
    }

    // Sort by success rate descending
    activeStrategies.sort((a, b) => {
      const rateA = this.learningEngine.getSuccessRate(a.id);
      const rateB = this.learningEngine.getSuccessRate(b.id);
      return rateB - rateA;
    });

    return activeStrategies;
  }

  public recordResult(strategyId: string, success: boolean) {
    this.learningEngine.recordAttempt(strategyId, success);
  }
}
