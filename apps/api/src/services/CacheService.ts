import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export class CacheService {
  private static instance: CacheService;
  private db: Database.Database;

  private constructor() {
    const cacheDir = path.join(process.cwd(), 'temp', 'cache');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    const dbPath = path.join(cacheDir, 'excerpt_cache.db');
    this.db = new Database(dbPath);
    
    // Initialize Schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_store (
        cache_key TEXT PRIMARY KEY,
        cache_val TEXT,
        expires_at INTEGER,
        created_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_expires ON cache_store(expires_at);
    `);
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Set key-value pair in the cache with optional TTL in seconds
   */
  public set(key: string, value: any, ttlSeconds: number = 86400): void {
    const valStr = JSON.stringify(value);
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const createdAt = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_store (cache_key, cache_val, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(key, valStr, expiresAt, createdAt);
  }

  /**
   * Get cached value by key. Auto-deletes if expired.
   */
  public get<T>(key: string): T | null {
    const stmt = this.db.prepare(`
      SELECT cache_val, expires_at FROM cache_store WHERE cache_key = ?
    `);
    const row = stmt.get(key) as { cache_val: string; expires_at: number } | undefined;
    
    if (!row) return null;
    
    const now = Math.floor(Date.now() / 1000);
    if (row.expires_at < now) {
      // Clean up expired entry
      this.delete(key);
      return null;
    }
    
    try {
      return JSON.parse(row.cache_val) as T;
    } catch {
      return null;
    }
  }

  /**
   * Delete key from cache
   */
  public delete(key: string): void {
    const stmt = this.db.prepare('DELETE FROM cache_store WHERE cache_key = ?');
    stmt.run(key);
  }

  /**
   * Clean all expired entries
   */
  public pruneExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare('DELETE FROM cache_store WHERE expires_at < ?');
    stmt.run(now);
  }
}
