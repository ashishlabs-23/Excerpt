import { CategoryAdapter } from './adapters/BaseAdapter';
import { ContentCategory } from './PipelineContext';
import { FootballAdapter } from './adapters/FootballAdapter';
import { CricketAdapter } from './adapters/CricketAdapter';
import { BasketballAdapter } from './adapters/BasketballAdapter';
import { MMAAdapter } from './adapters/MMAAdapter';
import { PodcastAdapter } from './adapters/PodcastAdapter';
import { VlogAdapter } from './adapters/VlogAdapter';

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters: Map<ContentCategory, CategoryAdapter> = new Map();

  private constructor() {
    this.registerDefaults();
  }

  public static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  public register(adapter: CategoryAdapter): void {
    this.adapters.set(adapter.category as ContentCategory, adapter);
  }

  public getAdapter(category: ContentCategory): CategoryAdapter | undefined {
    return this.adapters.get(category);
  }

  public clear(): void {
    this.adapters.clear();
  }

  public registerDefaults(): void {
    this.register(new FootballAdapter());
    this.register(new CricketAdapter());
    this.register(new BasketballAdapter());
    this.register(new MMAAdapter());
    this.register(new PodcastAdapter());
    this.register(new VlogAdapter());
  }
}
