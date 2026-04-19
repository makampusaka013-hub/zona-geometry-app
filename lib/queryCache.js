/**
 * Simple TTL Cache for Supabase queries
 */
export class QueryCache {
  constructor(ttl = 30000) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  async get(key, fetchFn) {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp < this.ttl)) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  invalidate(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
}

export const globalCache = new QueryCache();
