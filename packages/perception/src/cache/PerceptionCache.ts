import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

export class PerceptionCache {
  constructor(private cacheDirectory: string) {}

  async init() {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
  }

  generateKey(mediaChecksum: string, engineName: string, engineVersion: string, config: any): string {
    const hash = crypto.createHash('sha256');
    hash.update(mediaChecksum);
    hash.update(engineName);
    hash.update(engineVersion);
    hash.update(JSON.stringify(config));
    return hash.digest('hex');
  }

  async get(key: string): Promise<any | null> {
    const filePath = path.join(this.cacheDirectory, `${key}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }

  async set(key: string, data: any): Promise<void> {
    const filePath = path.join(this.cacheDirectory, `${key}.json`);
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
  }
}
