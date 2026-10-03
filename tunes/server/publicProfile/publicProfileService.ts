import { canReadPublicCategory, type PublicCategory } from "./publicProfilePolicy";

export interface PublicProfileGateway {
  resolveAccount(username: string): Promise<Record<string, unknown> | undefined>;
  resolveCategory(username: string, category: PublicCategory, limit: number, cursor?: string): Promise<unknown>;
  resolveDetail(username: string, category: PublicCategory, slug: string, limit: number, cursor?: string): Promise<unknown>;
}

export type PublicProfileReadOptions = { bypassCache?: boolean; cursor?: string };

type CacheEntry<T> = { value: T; expiresAt: number };

type PublicProfileServiceOptions = {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
};

export class PublicProfileService {
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly accounts = new Map<string, CacheEntry<Record<string, unknown>>>();
  private readonly categories = new Map<string, CacheEntry<unknown>>();
  private readonly accountReads = new Map<string, Promise<Record<string, unknown> | undefined>>();
  private readonly categoryReads = new Map<string, Promise<unknown>>();

  constructor(private readonly gateway: PublicProfileGateway, options: PublicProfileServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.ttlMs = options.ttlMs ?? 30_000;
    this.maxEntries = options.maxEntries ?? 500;
  }

  private read<T>(cache: Map<string, CacheEntry<T>>, key: string, bypassCache: boolean): T | undefined {
    if (bypassCache) return undefined;
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private write<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T): void {
    if (cache.size >= this.maxEntries && !cache.has(key)) cache.delete(cache.keys().next().value as string);
    cache.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  private async account(username: string, bypassCache: boolean): Promise<Record<string, unknown> | undefined> {
    if (this.ttlMs === 0) return this.gateway.resolveAccount(username);
    const cached = this.read(this.accounts, username, bypassCache);
    if (cached) return cached;
    const inFlight = this.accountReads.get(username);
    if (inFlight) return inFlight;
    const request = this.gateway.resolveAccount(username)
      .then((account) => {
        if (account) this.write(this.accounts, username, account);
        return account;
      })
      .finally(() => this.accountReads.delete(username));
    this.accountReads.set(username, request);
    return request;
  }

  private async categoryRead(key: string, resolve: () => Promise<unknown>): Promise<unknown> {
    const inFlight = this.categoryReads.get(key);
    if (inFlight) return inFlight;
    const request = resolve().finally(() => this.categoryReads.delete(key));
    this.categoryReads.set(key, request);
    return request;
  }

  async category(username: string, category: PublicCategory, limit: number, options: PublicProfileReadOptions = {}): Promise<unknown | undefined> {
    if (category === 'books') return this.freshBooksRead(username, () => this.gateway.resolveCategory(username, category, limit, options.cursor));
    const key = `${username}:${category}:${limit}:${options.cursor ?? "first"}`;
    const cached = this.read(this.categories, key, Boolean(options.bypassCache));
    if (cached !== undefined) return cached;
    const account = await this.account(username, Boolean(options.bypassCache));
    if (!account || !canReadPublicCategory(account, category)) return undefined;
    const value = await this.categoryRead(key, () => this.gateway.resolveCategory(username, category, limit, options.cursor));
    this.write(this.categories, key, value);
    return value;
  }

  async shell(username: string, options: PublicProfileReadOptions = {}): Promise<Record<string, unknown> | undefined> {
    const account = await this.account(username, Boolean(options.bypassCache));
    return account?.public_profile === "Yes" ? account : undefined;
  }

  async detail(username: string, category: PublicCategory, slug: string, limit: number, options: PublicProfileReadOptions = {}): Promise<unknown | undefined> {
    if (category === 'books') return this.freshBooksRead(username, () => this.gateway.resolveDetail(username, category, slug, limit, options.cursor));
    const key = `${username}:${category}:${slug}:${limit}:${options.cursor ?? "first"}`;
    const cached = this.read(this.categories, key, Boolean(options.bypassCache));
    if (cached !== undefined) return cached;
    const account = await this.account(username, Boolean(options.bypassCache));
    if (!account || !canReadPublicCategory(account, category)) return undefined;
    const value = await this.categoryRead(key, () => this.gateway.resolveDetail(username, category, slug, limit, options.cursor));
    this.write(this.categories, key, value);
    return value;
  }

  // Books content never consumes cached or coalesced authorization. Recheck after
  // composition too: a pre-hide request cannot repopulate or return an old read.
  private async freshBooksRead(username: string, resolve: () => Promise<unknown>): Promise<unknown | undefined> {
    const before = await this.gateway.resolveAccount(username);
    if (!before || !canReadPublicCategory(before, 'books')) return undefined;
    const value = await resolve();
    const after = await this.gateway.resolveAccount(username);
    return after && canReadPublicCategory(after, 'books') ? value : undefined;
  }
}
