import { handleRedirectMarker } from "./handleRedirect";
import { canReadPublicCategory, type PublicCategory } from "./publicProfilePolicy";
import {discardGamePublicResult,assertGamePublicOperation,runGamePublicRead,createGamePublicExecutor,type GamePublicOperation,type GamePublicExecutor} from './publicGamesProjection';
import type {GamesPublicPage} from '../../shared/explorersGameOwnerContract';

export interface PublicProfileGateway {
  resolveGamesAccount?(username:string):Promise<Record<string,unknown>|undefined>;
  resolvePeopleSector?(username:string,sectorSlug:string,limit:number,cursor?:string):Promise<unknown>;
  resolveMovieGenre?(username:string,genreSlug:string,limit:number,cursor?:string):Promise<unknown>;
  resolveAccount(username: string): Promise<Record<string, unknown> | undefined>;
  /** The current handle of the public account that released `username` within the hold, if any. */
  resolveHandleRedirect?(username: string): Promise<string | undefined>;
  resolveCategory(username: string, category: PublicCategory, limit: number, cursor?: string,operation?:GamePublicOperation): Promise<unknown>;
  resolveDetail(username: string, category: PublicCategory, slug: string, limit: number, cursor?: string,operation?:GamePublicOperation): Promise<unknown>;
}

export type PublicProfileReadOptions = { bypassCache?: boolean; cursor?: string; signal?:AbortSignal };

type CacheEntry<T> = { value: T; expiresAt: number };

type PublicProfileServiceOptions = {
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
};

export class PublicProfileService {
  private readonly gamesExecutor:GamePublicExecutor;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly accounts = new Map<string, CacheEntry<Record<string, unknown>>>();
  private readonly categories = new Map<string, CacheEntry<unknown>>();
  private readonly accountReads = new Map<string, Promise<Record<string, unknown> | undefined>>();
  private readonly categoryReads = new Map<string, Promise<unknown>>();

  constructor(private readonly gateway: PublicProfileGateway, options: PublicProfileServiceOptions = {}) {
    this.gamesExecutor=createGamePublicExecutor(gateway,async(shared,input,operation)=>{
      const authority=()=>shared.resolveGamesAccount?.(input.username)??shared.resolveAccount(input.username);
      assertGamePublicOperation(operation);const before=await authority();assertGamePublicOperation(operation);
      if(!before||!canReadPublicCategory(before,'games'))return undefined;
      const value=await (input.kind==='category'?shared.resolveCategory(input.username,'games',input.limit,input.cursor,operation):shared.resolveDetail(input.username,'games',input.slug!,input.limit,input.cursor,operation)) as GamesPublicPage|undefined;
      assertGamePublicOperation(operation);if(!value)return undefined;
      try{const after=await authority();assertGamePublicOperation(operation);if(after&&canReadPublicCategory(after,'games')&&before.documentId===after.documentId)return value;discardGamePublicResult(value);return undefined;}
      catch(error){discardGamePublicResult(value);throw error;}
    });
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
    if(category==='games')return runGamePublicRead({username,kind:'category',limit,cursor:options.cursor},this.gamesExecutor,options.signal);
    if (category === 'books' || category === 'movies' || category === 'people' || category === 'places') return this.freshBooksRead(username, category, () => this.gateway.resolveCategory(username, category, limit, options.cursor));
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
    if (account) return account.public_profile === "Yes" ? account : undefined;
    // Not a handle anyone holds now; it may be one an account just left (see handleRedirect).
    const moved = await this.gateway.resolveHandleRedirect?.(username);
    return moved ? handleRedirectMarker(moved) : undefined;
  }

  async detail(username: string, category: PublicCategory, slug: string, limit: number, options: PublicProfileReadOptions = {}): Promise<unknown | undefined> {
    if(category==='games')return runGamePublicRead({username,kind:'detail',slug,limit,cursor:options.cursor},this.gamesExecutor,options.signal);
    if (category === 'books' || category === 'movies' || category === 'people' || category === 'places') return this.freshBooksRead(username, category, () => this.gateway.resolveDetail(username, category, slug, limit, options.cursor));
    const key = `${username}:${category}:${slug}:${limit}:${options.cursor ?? "first"}`;
    const cached = this.read(this.categories, key, Boolean(options.bypassCache));
    if (cached !== undefined) return cached;
    const account = await this.account(username, Boolean(options.bypassCache));
    if (!account || !canReadPublicCategory(account, category)) return undefined;
    const value = await this.categoryRead(key, () => this.gateway.resolveDetail(username, category, slug, limit, options.cursor));
    this.write(this.categories, key, value);
    return value;
  }

  async peopleSector(username:string,sectorSlug:string,limit:number,options:PublicProfileReadOptions={}):Promise<unknown|undefined>{return this.freshBooksRead(username,'people',()=>this.gateway.resolvePeopleSector?.(username,sectorSlug,limit,options.cursor)??Promise.resolve(undefined));}
  async movieGenre(username:string,genreSlug:string,limit:number,options:PublicProfileReadOptions={}):Promise<unknown|undefined>{return this.freshBooksRead(username,'movies',()=>this.gateway.resolveMovieGenre?.(username,genreSlug,limit,options.cursor)??Promise.resolve(undefined));}

  // Books and Movies content never consume cached or coalesced authorization. Recheck after
  // composition too: a pre-hide request cannot repopulate or return an old read.
  private async freshBooksRead(username: string, category: PublicCategory, resolve: () => Promise<unknown>): Promise<unknown | undefined> {
    const before = await this.gateway.resolveAccount(username);
    if (!before || !canReadPublicCategory(before, category)) return undefined;
    const value = await resolve();
    const after = await this.gateway.resolveAccount(username);
    return after&&before.documentId===after.documentId&&canReadPublicCategory(after,category)?value:undefined;
  }
}
