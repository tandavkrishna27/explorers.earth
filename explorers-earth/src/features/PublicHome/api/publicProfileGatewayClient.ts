import {adaptPublicGamesPage} from '../utils/publicProfileContent';
import { runtimeOrigin } from "../../../lib/publicRuntimeConfig";
export type PublicCategory = "places" | "movies" | "books" | "games" | "guides" | "apps" | "products" | "people";
export type PublicProfilePage = { limit?: number; cursor?: string };


export type PublicProfileHttpError = Error & { status: number; retryAfterMs?: number };
/** Retry-After is delta-seconds or an HTTP date; anything else (or absurd) is ignored. Capped at 5 minutes. */
export function parseRetryAfterMs(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const ms = /^\d{1,6}$/.test(trimmed) ? Number(trimmed) * 1000 : Date.parse(trimmed) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, 300_000) : undefined;
}
function publicProfileHttpError(status: number, retryAfter: string | null): PublicProfileHttpError {
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  return Object.assign(new Error(`PUBLIC_PROFILE_${status}`), { status, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) });
}
/** Only a real 404 means "this profile does not exist". 429, 5xx, network and parse failures are retryable. */
export function isPublicProfileNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "PUBLIC_PROFILE_404";
}
export function publicProfileRetryAfterMs(error: unknown): number | undefined {
  return error instanceof Error ? (error as Partial<PublicProfileHttpError>).retryAfterMs : undefined;
}

type FetchLike = typeof fetch;
async function gameBounded<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 void work.catch(()=>{});
 if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
 let abort!:()=>void;const stopped=new Promise<never>((_resolve,reject)=>{abort=()=>reject(Error('PUBLIC_PROFILE_ABORTED'));signal.addEventListener('abort',abort,{once:true});});
 try{return await Promise.race([work,stopped]);}finally{signal.removeEventListener('abort',abort);}
}
async function readGamesResponse(response:Response,username:string,signal:AbortSignal){
 const limit=4*1024*1024,declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d{1,16}$/.test(declared)||Number(declared)>limit)){void response.body?.cancel().catch(()=>{});throw Error('PUBLIC_PROFILE_READ_LIMIT');}
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{
  if(reader)while(true){const part=await gameBounded(reader.read(),signal);if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('PUBLIC_PROFILE_READ_LIMIT');chunks.push(part.value);}
  if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  try{return adaptPublicGamesPage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)),username);}catch{throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');}
 }finally{if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Best-effort cleanup must not replace the read result or its original error/cancellation. */}}}
}

/** The People server bounds every serialized overview, detail and sector page at 4 MiB. */
async function readPeopleResponse(response:Response,signal:AbortSignal):Promise<unknown>{
 const limit=4*1024*1024,declared=response.headers.get('content-length');
 if(declared!==null&&(!/^\d{1,16}$/.test(declared)||Number(declared)>limit)){
  void response.body?.cancel().catch(()=>{});
  throw Error('PUBLIC_PROFILE_READ_LIMIT');
 }
 const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{
  if(reader)while(true){
   const part=await gameBounded(reader.read(),signal);if(part.done)break;
   bytes+=part.value.byteLength;if(bytes>limit)throw Error('PUBLIC_PROFILE_READ_LIMIT');
   chunks.push(part.value);
  }
  if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
  const joined=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}
  catch{throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');}
 }catch(error){
  if(signal.aborted)throw Error('PUBLIC_PROFILE_ABORTED');
  if(error instanceof Error&&/^PUBLIC_PROFILE_(READ_LIMIT|INVALID_RESPONSE|ABORTED)$/.test(error.message))throw error;
  throw Error('PUBLIC_PROFILE_INVALID_RESPONSE');
 }finally{
  if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{/* Cleanup must not replace the read error. */}}
 }
}

type PublicProfileGatewayEnvironment = {
  VITE_PUBLIC_PROFILE_GATEWAY_URL?: string;
  VITE_LOCAL_TUNES_API_URL?: string;
};

export function resolvePublicProfileGatewayOrigin(environment: PublicProfileGatewayEnvironment): string {
  return environment.VITE_PUBLIC_PROFILE_GATEWAY_URL
    || environment.VITE_LOCAL_TUNES_API_URL
    || "https://localtunes.earth";
}

export function createPublicProfileGatewayClient(baseUrl: string, fetchImpl: FetchLike = fetch) {
  const origin = baseUrl.replace(/\/$/, "");
  const cache = new Map<string, { etag?: string; value: unknown }>();
  const categoryPath = (username: string, category: PublicCategory) =>
    `/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}`;
  const requestOnce = async (path: string, signal?: AbortSignal, bypassCache = false, gamesUsername?:string, bounded = false): Promise<unknown> => {
    const url = `${origin}${path}`;
    const people = /\/recommendations\/people(?:\/|\?|$)/.test(path);
    // Deliberately independent of the cache predicate below. Both used to be the SAME
    // expression, so bounding a read also made it uncached -- and the shell is the most
    // requested read in the product. `bounded` is opt-in per call site instead.
    // AbortController + setTimeout rather than AbortSignal.any: `.any` needs Safari 17.4,
    // there is no browserslist, and esbuild cannot polyfill a runtime API, so on the shell
    // path that would hard-error every public profile on an older Safari.
    const deadline = gamesUsername === undefined && !people && !bounded ? undefined : new AbortController();
    const expiry = deadline ? setTimeout(() => deadline.abort(), bounded ? 12_000 : 15_000) : undefined;
    // The caller-abort link is deliberately NOT torn down in the finally. AbortSignal.any
    // produced a dependent signal that stayed linked for the caller signal's whole life, and
    // publicPeopleTransport.test.ts:71 pins that: it aborts the caller AFTER the read settles
    // and asserts the signal handed to fetch aborted too. Removing the listener broke it.
    let forward: (() => void) | undefined;
    if (deadline && signal) {
      if (signal.aborted) deadline.abort();
      else { forward = () => deadline.abort(); signal.addEventListener("abort", forward, { once: true }); }
    }
    const boundedSignal = deadline?.signal;
    try {
      const cached = gamesUsername===undefined&&!people?cache.get(url):undefined;
      const fetching = fetchImpl(url, {
        // Owner-controlled visibility and pinning must not be hidden behind a
        // browser's fresh/stale HTTP response after a public-page reload. This
        // still permits conditional ETag validation and the gateway's cache.
        cache: people ? "no-store" : "no-cache",
        ...(people ? { credentials: "omit" as const } : {}),
        signal:boundedSignal??signal,
        headers: {
          Accept: "application/json",
          ...(cached?.etag ? { "If-None-Match": cached.etag } : {}),
          ...(bypassCache ? { "Cache-Control": "no-cache" } : {}),
        },
      });
      if(boundedSignal)void fetching.then(late=>{if(boundedSignal.aborted)void late.body?.cancel().catch(()=>{});},()=>{});
      const response=people
        ? await gameBounded(fetching,boundedSignal!).catch(()=>{throw Error(boundedSignal!.aborted?'PUBLIC_PROFILE_ABORTED':'PUBLIC_PROFILE_UNAVAILABLE');})
        : boundedSignal?await gameBounded(fetching,boundedSignal):await fetching;
      if (response.status === 304) {
        if (cached) return cached.value;
        if(people)void response.body?.cancel().catch(()=>{});
        throw new Error("PUBLIC_PROFILE_304");
      }
      if (!response.ok) {if(gamesUsername!==undefined)cache.delete(url);if(people)void response.body?.cancel().catch(()=>{});throw publicProfileHttpError(response.status,response.headers.get('retry-after'));}
      if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
        if(people)void response.body?.cancel().catch(()=>{});
        throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
      }
      const value=gamesUsername!==undefined?await readGamesResponse(response,gamesUsername,boundedSignal!):people?await readPeopleResponse(response,boundedSignal!):bounded?await gameBounded(response.json(),boundedSignal!):await response.json();
      const etag = response.headers.get("etag") ?? undefined;
      if(gamesUsername===undefined&&!people)cache.set(url, { etag, value });
      return value;
    } finally {
      // Seven exit paths and no previous finally: a bare setTimeout is ref'd (unlike
      // AbortSignal.timeout), so clearing it anywhere else would leak a pending timer on
      // every throw -- including PUBLIC_PROFILE_404, the most common outcome.
      if (expiry !== undefined) clearTimeout(expiry);
    }
  };

  // One public profile page mounts the nav (a request per category) and the page body (the same
  // category again, plus per-list previews), and StrictMode mounts twice. Identical GETs share one
  // in-flight request, so a page load costs each distinct URL once against the per-IP rate limit.
  // Settled answers are not reused here (the ETag cache above handles that with a conditional
  // request), so owner changes are never hidden. Explicit revalidation (bypassCache) never joins. Each caller keeps its own AbortSignal: the shared fetch aborts only when every
  // caller has aborted.
  type Shared = { promise: Promise<unknown>; controller: AbortController; subscribers: number };
  const shared = new Map<string, Shared>();
  const request = (path: string, signal?: AbortSignal, bypassCache = false, gamesUsername?: string, bounded = false): Promise<unknown> => {
    const key = `${origin}${path}`;
    if (bypassCache) { shared.delete(key); return requestOnce(path, signal, bypassCache, gamesUsername, bounded); }
    let entry = shared.get(key);
    if (entry?.controller.signal.aborted) { shared.delete(key); entry = undefined; }
    if (!entry) {
      const controller = new AbortController();
      const created: Shared = { controller, subscribers: 0, promise: undefined as unknown as Promise<unknown> };
      created.promise = requestOnce(path, controller.signal, false, gamesUsername, bounded).then(
        (value) => { if (shared.get(key) === created) shared.delete(key); return value; },
        (error) => { if (shared.get(key) === created) shared.delete(key); throw error; },
      );
      created.promise.catch(() => undefined);
      shared.set(key, created);
      entry = created;
    }
    const mine = entry;
    mine.subscribers += 1;
    if (!signal) return mine.promise;
    // Deliberately not detached once settled (see requestOnce): a late abort still reaches the fetch signal.
    return new Promise<unknown>((resolve, reject) => {
      const onAbort = () => {
        mine.subscribers -= 1;
        if (mine.subscribers <= 0) mine.controller.abort();
        reject(new Error("PUBLIC_PROFILE_ABORTED"));
      };
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener("abort", onAbort, { once: true });
      mine.promise.then(resolve, reject);
    });
  };
  const pageQuery = (page: PublicProfilePage = {}): string => {
    const params = new URLSearchParams();
    if (page.limit !== undefined) params.set("limit", String(page.limit));
    if (page.cursor !== undefined) params.set("cursor", page.cursor);
    const query = params.toString();
    return query ? `?${query}` : "";
  };
  return {
    async peopleSectorPage(username:string,sectorSlug:string,page:PublicProfilePage={},signal?:AbortSignal):Promise<unknown>{return request(`${categoryPath(username,'people')}/sectors/${encodeURIComponent(sectorSlug)}${pageQuery(page)}`,signal);},
    async movieGenrePage(username:string,genreSlug:string,page:PublicProfilePage={},signal?:AbortSignal,bypassCache=false):Promise<unknown>{return request(`${categoryPath(username,'movies')}/genres/${encodeURIComponent(genreSlug)}${pageQuery(page)}`,signal,bypassCache);},
    async shell(username: string, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}`, signal, bypassCache, undefined, true);
    },
    async category(username: string, category: PublicCategory, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(categoryPath(username, category), signal, bypassCache,category==='games'?username:undefined);
    },
    peekCategory(username: string, category: PublicCategory): unknown | undefined {
      return category==='games'||category==='people'?undefined:cache.get(`${origin}${categoryPath(username, category)}`)?.value;
    },
    async detail(username: string, category: PublicCategory, slug: string, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}/${encodeURIComponent(slug)}`, signal, bypassCache,category==='games'?username:undefined);
    },
    async categoryPage(username: string, category: PublicCategory, page: PublicProfilePage, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}${pageQuery(page)}`, signal, bypassCache,category==='games'?username:undefined);
    },
    async detailPage(username: string, category: PublicCategory, slug: string, page: PublicProfilePage, signal?: AbortSignal, bypassCache = false): Promise<unknown> {
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}/recommendations/${category}/${encodeURIComponent(slug)}${pageQuery(page)}`, signal, bypassCache,category==='games'?username:undefined);
    },
  };
}

export const publicProfileGatewayClient = createPublicProfileGatewayClient(
  // Keep the runtime boundary explicit: this project's ImportMetaEnv may not
  // declare custom VITE_* fields even though Vite exposes them at runtime.
  runtimeOrigin(resolvePublicProfileGatewayOrigin({
    VITE_PUBLIC_PROFILE_GATEWAY_URL: import.meta.env.VITE_PUBLIC_PROFILE_GATEWAY_URL,
    VITE_LOCAL_TUNES_API_URL: import.meta.env.VITE_LOCAL_TUNES_API_URL,
  })),
);
