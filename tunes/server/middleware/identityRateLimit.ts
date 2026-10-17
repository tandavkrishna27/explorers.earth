export interface IdentityRateLimitOptions {
  limit: number;
  globalLimit?: number;
  windowMs: number;
  maxEntries: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
  touchedAt: number;
}

interface BucketReservation {
  allowed: true;
  rollback: () => void;
}

interface BucketDenial {
  allowed: false;
  retryAfterSeconds: number;
  saturated?: boolean;
}

export interface IdentityRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
  saturated?: boolean;
}

export class BoundedIdentityRateLimiter {
  private readonly sourceBuckets = new Map<string, Bucket>();
  private readonly fingerprintBuckets = new Map<string, Bucket>();
  private readonly now: () => number;
  private globalTokens: number;
  private globalUpdatedAt: number;

  constructor(private readonly options: IdentityRateLimitOptions) {
    const globalLimit = options.globalLimit ?? options.limit * options.maxEntries;
    if (![options.limit, globalLimit, options.windowMs, options.maxEntries].every(Number.isSafeInteger)
        || options.limit < 1 || globalLimit < 1 || options.windowMs < 1 || options.maxEntries < 2) {
      throw new Error("identity rate-limit bounds must be positive");
    }
    this.now = options.now ?? Date.now;
    this.globalTokens = globalLimit;
    this.globalUpdatedAt = this.now();
  }

  check(source: string, fingerprint: string): IdentityRateLimitResult {
    const now = this.now();
    this.prune(now);
    const sourceResult = this.reserve(this.sourceBuckets, source, now, this.sourceCapacity());
    if (!sourceResult.allowed) return sourceResult;
    const fingerprintResult = this.reserve(this.fingerprintBuckets, fingerprint, now, this.fingerprintCapacity());
    if (!fingerprintResult.allowed) {
      sourceResult.rollback();
      return fingerprintResult;
    }
    const globalResult = this.consumeGlobal(now);
    if (!globalResult.allowed) {
      fingerprintResult.rollback();
      sourceResult.rollback();
      return globalResult;
    }
    return { allowed: true };
  }

  size(): number {
    return this.sourceBuckets.size + this.fingerprintBuckets.size;
  }

  private reserve(
    buckets: Map<string, Bucket>,
    key: string,
    now: number,
    capacity: number,
  ): BucketDenial | BucketReservation {
    let bucket = buckets.get(key);
    const created = !bucket;
    if (!bucket) {
      if (buckets.size >= capacity) {
        return { allowed: false, retryAfterSeconds: 1, saturated: true };
      }
      bucket = { count: 0, resetAt: now + this.options.windowMs, touchedAt: now };
    }
    if (bucket.count >= this.options.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
      };
    }
    const previousTouchedAt = bucket.touchedAt;
    bucket.count += 1;
    bucket.touchedAt = now;
    buckets.delete(key);
    buckets.set(key, bucket);
    return {
      allowed: true,
      rollback: () => {
        if (buckets.get(key) !== bucket) return;
        if (created) buckets.delete(key);
        else {
          bucket.count -= 1;
          bucket.touchedAt = previousTouchedAt;
        }
      },
    };
  }

  private prune(now: number): void {
    for (const buckets of [this.sourceBuckets, this.fingerprintBuckets]) {
      buckets.forEach((bucket, key) => {
        if (bucket.resetAt <= now) buckets.delete(key);
      });
    }
  }

  private consumeGlobal(now: number): IdentityRateLimitResult {
    const capacity = this.options.globalLimit ?? this.options.limit * this.options.maxEntries;
    const elapsed = Math.max(0, now - this.globalUpdatedAt);
    this.globalTokens = Math.min(capacity, this.globalTokens + elapsed * capacity / this.options.windowMs);
    this.globalUpdatedAt = now;
    if (this.globalTokens >= 1) {
      this.globalTokens -= 1;
      return { allowed: true };
    }
    const millisecondsUntilToken = (1 - this.globalTokens) * this.options.windowMs / capacity;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(millisecondsUntilToken / 1_000)),
    };
  }

  private sourceCapacity(): number {
    return Math.max(1, Math.floor(this.options.maxEntries / 2));
  }

  private fingerprintCapacity(): number {
    return Math.max(1, this.options.maxEntries - this.sourceCapacity());
  }
}
