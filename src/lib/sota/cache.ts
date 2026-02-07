// SOTA GENERATION CACHE - Request Deduplication & Caching

import type { CacheEntry } from './types';

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

class GenerationCache {
  private cache = new Map<string, CacheEntry<Promise<unknown>>>();
  private accessOrder: string[] = [];

  private generateKey(params: unknown): string {
    return JSON.stringify(params, Object.keys(params as object).sort());
  }

  get<T>(params: unknown): Promise<T> | undefined {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);
    
    if (!entry) return undefined;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      return undefined;
    }
    
    // Move to end (most recently used)
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
    
    return entry.data as Promise<T>;
  }

  set<T>(params: unknown, promise: Promise<T>, ttl: number = DEFAULT_TTL): void {
    const key = this.generateKey(params);
    
    // Evict oldest if at capacity
    if (this.cache.size >= MAX_CACHE_SIZE && !this.cache.has(key)) {
      const oldestKey = this.accessOrder.shift();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    this.cache.set(key, {
      data: promise,
      timestamp: Date.now(),
      ttl
    });
    
    this.accessOrder.push(key);

    // Auto-cleanup after TTL
    promise.finally(() => {
      setTimeout(() => {
        const entry = this.cache.get(key);
        if (entry && Date.now() - entry.timestamp >= entry.ttl) {
          this.cache.delete(key);
          this.accessOrder = this.accessOrder.filter(k => k !== key);
        }
      }, ttl);
    });
  }

  has(params: unknown): boolean {
    return this.get(params) !== undefined;
  }

  delete(params: unknown): boolean {
    const key = this.generateKey(params);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: this.hits / (this.hits + this.misses) || 0
    };
  }

  private hits = 0;
  private misses = 0;

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }
}

// Singleton instance
export const generationCache = new GenerationCache();

// Specialized caches for different purposes
export const serpCache = new GenerationCache();
export const schemaCache = new GenerationCache();
export const validationCache = new GenerationCache();
