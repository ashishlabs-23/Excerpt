class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const lock = () => {
        this.locked = true;
        resolve(() => {
          this.locked = false;
          if (this.queue.length > 0) {
            const next = this.queue.shift();
            if (next) next();
          }
        });
      };
      
      if (!this.locked) {
        lock();
      } else {
        this.queue.push(lock);
      }
    });
  }
}

/**
 * A simulation of a Redis-backed atomic data store for exactly-once guarantees.
 * Uses a naive async queue internally to guarantee async-safe atomicity in tests.
 */
export class AtomicStore {
  private store = new Map<string, string | number>();
  private mutex = new Mutex();

  /**
   * Sets a key to a value.
   */
  async set(key: string, value: string | number): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.store.set(key, value);
    } finally {
      release();
    }
  }

  /**
   * Retrieves a value.
   */
  async get(key: string): Promise<string | number | undefined> {
    const release = await this.mutex.acquire();
    try {
      return this.store.get(key);
    } finally {
      release();
    }
  }

  /**
   * Set-If-Not-Exists.
   * Returns true if the key was set, false if it already existed.
   */
  async setNX(key: string, value: string | number): Promise<boolean> {
    const release = await this.mutex.acquire();
    try {
      if (this.store.has(key)) {
        return false;
      }
      this.store.set(key, value);
      return true;
    } finally {
      release();
    }
  }

  /**
   * Atomically decrements a numeric key and returns the new value.
   * Throws if the key does not exist or is not a number.
   */
  async decr(key: string): Promise<number> {
    const release = await this.mutex.acquire();
    try {
      const val = this.store.get(key);
      if (val === undefined || typeof val !== 'number') {
        throw new Error(`Cannot decrement non-numeric or missing key: ${key}`);
      }
      const newVal = val - 1;
      this.store.set(key, newVal);
      return newVal;
    } finally {
      release();
    }
  }
}
