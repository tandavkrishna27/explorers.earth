import {adaptPublicGamesPage} from '../utils/publicProfileContent';
import { runtimeOrigin } from "../../../lib/publicRuntimeConfig";
export type PublicCategory = "places" | "movies" | "books" | "games" | "guides" | "apps" | "products" | "people";
export type PublicProfilePage = { limit?: number; cursor?: string };

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
  const request = async (path: string, signal?: AbortSignal, bypassCache = false, gamesUsername?:string): Promise<unknown> => {
    const url = `${origin}${path}`;
    const people = /\/recommendations\/people(?:\/|\?|$)/.test(path);
    const boundedSignal=gamesUsername===undefined&&!people?undefined:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]);
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
    if (!response.ok) {if(gamesUsername!==undefined)cache.delete(url);if(people)void response.body?.cancel().catch(()=>{});throw new Error(`PUBLIC_PROFILE_${response.status}`);}
    if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      if(people)void response.body?.cancel().catch(()=>{});
      throw new Error("PUBLIC_PROFILE_INVALID_RESPONSE");
    }
    const value=gamesUsername!==undefined?await readGamesResponse(response,gamesUsername,boundedSignal!):people?await readPeopleResponse(response,boundedSignal!):await response.json();
    const etag = response.headers.get("etag") ?? undefined;
    if(gamesUsername===undefined&&!people)cache.set(url, { etag, value });
    return value;
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
      return request(`/api/explorers/v1/profiles/${encodeURIComponent(username)}`, signal, bypassCache);
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
