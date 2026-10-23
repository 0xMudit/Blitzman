export interface CachedResource {
  body: Buffer;
  contentType: string;
  expiresAt: number;
}

export interface CacheStats {
  entries: number;
  bytes: number;
  maxBytes: number;
  hits: number;
  misses: number;
  hitRatio: number;
}

/**
 * A byte-bounded LRU with per-entry expiry. This is a stand-in for the shared
 * cache tier in a real PoP (nginx/Varnish or the CDN's object cache).
 */
export class ResourceCache {
  private entries = new Map<string, CachedResource>();
  private bytesUsed = 0;
  private hits = 0;
  private misses = 0;

  constructor(private readonly maxBytes: number) {}

  get(key: string): CachedResource | null {
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      this.bytesUsed -= entry.body.length;
      this.misses += 1;
      return null;
    }
    // Refresh insertion order for LRU eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry;
  }

  set(key: string, body: Buffer, contentType: string, ttlMs: number): void {
    if (body.length > this.maxBytes / 2) return;

    const existing = this.entries.get(key);
    if (existing) {
      this.entries.delete(key);
      this.bytesUsed -= existing.body.length;
    }

    while (this.bytesUsed + body.length > this.maxBytes) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      const evicted = this.entries.get(oldest.value);
      this.entries.delete(oldest.value);
      if (evicted) this.bytesUsed -= evicted.body.length;
    }

    this.entries.set(key, { body, contentType, expiresAt: Date.now() + ttlMs });
    this.bytesUsed += body.length;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.entries.size,
      bytes: this.bytesUsed,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
      hitRatio: total > 0 ? this.hits / total : 0,
    };
  }
}
