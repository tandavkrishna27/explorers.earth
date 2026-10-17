import type { Request } from "express";

interface Counter {
  count: number;
  resetAt: number;
}

export class InMemoryAnalyticsRateLimiter {
  private readonly counters = new Map<string, Counter>();

  constructor(
    private readonly limit = 120,
    private readonly windowMs = 60_000,
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {}

  allow(request: Request, accountId: string): boolean {
    const currentTime = this.now();
    // Express resolves `request.ip` through the app's constrained trust-proxy
    // policy. Using the socket peer alone would collapse every visitor behind
    // the same ingress into one rate-limit bucket.
    const clientIp = request.ip || request.socket.remoteAddress || "unknown-peer";
    const key = `${clientIp}|${accountId}`;
    const existing = this.counters.get(key);

    if (!existing || existing.resetAt <= currentTime) {
      if (this.counters.size >= this.maxKeys) this.prune(currentTime);
      if (this.counters.size >= this.maxKeys) {
        this.counters.delete(this.counters.keys().next().value as string);
      }
      this.counters.set(key, {
        count: 1,
        resetAt: currentTime + this.windowMs,
      });
      return true;
    }

    existing.count += 1;
    return existing.count <= this.limit;
  }

  private prune(currentTime: number) {
    this.counters.forEach((counter, key) => {
      if (counter.resetAt <= currentTime) this.counters.delete(key);
    });
  }
}
