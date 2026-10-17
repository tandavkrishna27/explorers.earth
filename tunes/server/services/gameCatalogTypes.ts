import type {Actor} from '../application/actor';
import type {GameProviderFacts,GameProviderRow} from '../../shared/explorersGameContract';
export type GameErrorCode='INVALID_INPUT'|'CURSOR_EXPIRED'|'RATE_LIMITED'|'PROVIDER_BUSY'|'PROVIDER_INVALID_RESPONSE'|'PROVIDER_UNAVAILABLE'|'GAME_CONTINUATION_LIMIT';
export class GameCatalogFailure extends Error {
 constructor(readonly status:410|422|429|502|503,readonly code:GameErrorCode,readonly retryAfterSeconds?:number){super(code==='GAME_CONTINUATION_LIMIT'?'Game search continuation limit reached':status===410?'Game cursor expired':status===422?'Invalid Game lookup':status===429?'Game lookup busy':status===502?'Invalid Game provider response':'Game provider unavailable');this.name='GameCatalogFailure';}
}
export const unavailable=()=>new GameCatalogFailure(503,'PROVIDER_UNAVAILABLE');
export const invalidResponse=()=>new GameCatalogFailure(502,'PROVIDER_INVALID_RESPONSE');
export const busy=()=>new GameCatalogFailure(429,'PROVIDER_BUSY');
export const LIMITS=Object.freeze({callers:64,tokenWaiters:32,native:8,memory:64*1024*1024,body:65536,catalogMemory:4*1024*1024,tokenMemory:2*1024*1024,sessions:128,accountSessions:4,sessionBytes:2*1024*1024,ttl:600000,callerMs:15000,phaseMs:5000,pages:250,scans:6000,callPages:4});
export type ActorBinding={accountId:string;userId:string;credentialKey:string;authorizationEpoch:string};
export type Credentials={clientId:string;clientSecret:string};
export type Release=()=>void;
export type NativeOperation<T>={outcome:Promise<T>;settled:Promise<void>;cancel:()=>void};
export type CatalogHooks={beforeStart:()=>Promise<void>;onStart:()=>void};
export type ProviderTransport={catalog:(query:string,signal:AbortSignal,hooks?:CatalogHooks)=>NativeOperation<readonly GameProviderRow[]>};
export type GameSearchPage={version:'explorers-game-candidates/v1';items:readonly GameProviderFacts[];nextCursor:string|null;expiresAt:number};
export type CatalogOptions={coordinator:import('./gameProviderBudget').GameProviderCoordinator;transport:ProviderTransport;authorize:(actor:Actor)=>Promise<ActorBinding>;now?:()=>number;randomBytes?:(n:number)=>Uint8Array;callerMs?:number};
/** Outcome cancellation does not imply resource settlement. */
export function bounded<T>(job:Promise<T>,signal:AbortSignal):Promise<T>{if(signal.aborted)return Promise.reject(unavailable());return new Promise((resolve,reject)=>{const abort=()=>{signal.removeEventListener('abort',abort);reject(unavailable());};signal.addEventListener('abort',abort,{once:true});job.then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});}
export function bindingEqual(a:ActorBinding,b:ActorBinding):boolean{return a.accountId===b.accountId&&a.userId===b.userId&&a.credentialKey===b.credentialKey&&a.authorizationEpoch===b.authorizationEpoch;}
