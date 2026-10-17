import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {request as httpsRequest} from 'node:https';
import type {RequestOptions} from 'node:https';
import type {TcpNetConnectOpts} from 'node:net';
import type {IncomingMessage,ClientRequest} from 'node:http';
import {z} from 'zod/v3';
import {publicAddress} from './bookCoverFetch';
import {parseStrictJson} from '../deployment/platform-release-contract';
import {parseGameProviderJson} from './gameCatalogContracts';
import type {GameProviderCoordinator} from './gameProviderBudget';
import {unavailable,invalidResponse,busy,bounded,GameCatalogFailure,LIMITS,type Credentials,type CatalogHooks,type NativeOperation,type Release} from './gameCatalogTypes';
import type {GameProviderRow} from '../../shared/explorersGameContract';
export type Address={address:string;family:number};
export type NativeResponse={status:number;rawHeaders:string[];body:AsyncIterable<Uint8Array>;complete:()=>boolean};
export type NativeTarget={url:URL;address:Address;headers:Record<string,string>;body:string;signal:AbortSignal};
export type TransportOptions={coordinator:GameProviderCoordinator;credentials:Credentials;now?:()=>number;phaseMs?:number;resolve?:(host:string)=>Promise<Address[]>;connect?:(target:NativeTarget)=>NativeOperation<NativeResponse>};
/** Internal native seam; only transport fixed-origin/DNS policy can construct production targets. */
export function connectGameNative(target:NativeTarget,request:typeof httpsRequest=httpsRequest):NativeOperation<NativeResponse>{
 let requestClosed!:()=>void,responseClosed!:()=>void,socketClosed!:()=>void;let hasResponse=false,hasSocket=false;let req:ClientRequest|undefined,res:IncomingMessage|undefined;
 const closure=Promise.all([new Promise<void>(r=>requestClosed=r),new Promise<void>(r=>responseClosed=r),new Promise<void>(r=>socketClosed=r)]).then(()=>undefined);
 const cancel=()=>{res?.destroy();req?.destroy();};
 const outcome=new Promise<NativeResponse>((resolve,reject)=>{try{
  const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'POST',agent:false,family:target.address.family,autoSelectFamily:false,servername:target.url.hostname,rejectUnauthorized:true,headers:{...target.headers,Host:target.url.host,'Content-Length':String(Buffer.byteLength(target.body)),Connection:'close'},maxHeaderSize:16384,signal:target.signal,lookup:(_host,_options,callback)=>callback(null,target.address.address,target.address.family)};
  req=request(target.url,options,message=>{hasResponse=true;res=message;message.once('close',responseClosed);resolve({status:message.statusCode??0,rawHeaders:message.rawHeaders,body:message,complete:()=>message.complete});});
  req.maxHeadersCount=64;req.on('error',()=>reject(unavailable()));req.on('socket',socket=>{hasSocket=true;socket.once('close',socketClosed);if(target.signal.aborted)socket.destroy();});req.once('close',()=>{requestClosed();if(!hasResponse)responseClosed();if(!hasSocket)socketClosed();});req.end(target.body);
 }catch{requestClosed();responseClosed();socketClosed();reject(unavailable());}});
 return {outcome,settled:closure,cancel};
}
type Token={value:string;generation:number;expiresAt:number};
type Flight={operation:NativeOperation<Token>;waiters:number};
type Authority={token?:Token;tokenRelease?:Release;flight?:Flight;generation:number};
const authority=new WeakMap<GameProviderCoordinator,Authority>();
const tokenSchema=z.object({access_token:z.string().min(1).max(4096).regex(/^[A-Za-z0-9._~-]+$/),token_type:z.string().refine(s=>s.toLowerCase()==='bearer'),expires_in:z.number().int().min(31).max(86400),scope:z.array(z.string().max(100)).max(32).optional()}).strict();
const fixedFailure=(error:unknown)=>error instanceof GameCatalogFailure?error:unavailable();
const unauthorizedResponses=new WeakSet<Error>();
function headers(response:NativeResponse):Map<string,string>{const m=new Map<string,string>();let bytes=0;if(response.rawHeaders.length%2||response.rawHeaders.length>128)throw invalidResponse();for(let i=0;i<response.rawHeaders.length;i+=2){const k=response.rawHeaders[i].toLowerCase(),v=response.rawHeaders[i+1];bytes+=Buffer.byteLength(k)+Buffer.byteLength(v)+4;if(bytes>16384||m.has(k))throw invalidResponse();m.set(k,v);}return m;}
function responseError(status:number,h:Map<string,string>):Error|undefined{if(status===429){const v=h.get('retry-after');return new GameCatalogFailure(429,'RATE_LIMITED',v&&/^[1-9]\d?$/.test(v)&&Number(v)<=60?Number(v):undefined);}if(status!==200){const error=unavailable();if(status===401)unauthorizedResponses.add(error);return error;}}
function phaseSignal(parent:AbortSignal,phaseMs:number):{signal:AbortSignal;stop:()=>void}{const c=new AbortController();const abort=()=>c.abort();parent.addEventListener('abort',abort,{once:true});if(parent.aborted)c.abort();const timer=setTimeout(abort,phaseMs);return {signal:c.signal,stop:()=>{clearTimeout(timer);parent.removeEventListener('abort',abort);}};}
/** Resolver, response iterator and disposal settlement survive outcome deadline. */
function receive<T>(options:TransportOptions,kind:'catalog'|'token',body:string,parent:AbortSignal,parse:(bytes:Uint8Array)=>T,onStart?:()=>void):NativeOperation<T>{
 const c=new AbortController();const relay=()=>c.abort();parent.addEventListener('abort',relay,{once:true});if(parent.aborted)c.abort();let connection:NativeOperation<NativeResponse>|undefined;let memoryRelease=()=>{},nativeRelease=()=>{};let firstError:unknown;let rejectOutcome!:(e:unknown)=>void;const phases:{signal:AbortSignal;stop:()=>void}[]=[];
 const phase=()=>{const p=phaseSignal(c.signal,options.phaseMs??LIMITS.phaseMs);phases.push(p);return p;};const cancel=()=>{c.abort();connection?.cancel();};
 const work=(async()=>{try{
  if(c.signal.aborted)throw unavailable();memoryRelease=options.coordinator.reserveMemory(kind==='catalog'?LIMITS.catalogMemory:LIMITS.tokenMemory);nativeRelease=options.coordinator.reserveStart(kind);onStart?.();
  const url=new URL(kind==='catalog'?'https://api.igdb.com/v4/games':'https://id.twitch.tv/oauth2/token');const dns=phase();const pending=(options.resolve??(host=>lookup(host,{all:true,verbatim:true})))(url.hostname);let addresses:Address[];try{addresses=await bounded(pending,dns.signal);}catch(error){firstError=fixedFailure(error);rejectOutcome(firstError);cancel();await pending.then(()=>undefined,()=>undefined);throw error;}finally{dns.stop();}
  if(c.signal.aborted||!Array.isArray(addresses)||!addresses.length||addresses.length>64||addresses.some(a=>!a||isIP(a.address)!==a.family||!publicAddress(a.address)))throw unavailable();
  const transportHeaders=kind==='token'?{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json','Accept-Encoding':'identity'}:{'Content-Type':'text/plain; charset=utf-8',Accept:'application/json','Accept-Encoding':'identity'};
  // Token-dependent catalog headers are supplied through private receive closure below.
  const extra=(options as TransportOptions&{catalogHeaders?:Record<string,string>}).catalogHeaders??{};
  (options as TransportOptions&{beforeConnect?:()=>void}).beforeConnect?.();const connectPhase=phase();connection=(options.connect??connectGameNative)({url,address:{...addresses[0]},headers:{...transportHeaders,...extra},body,signal:c.signal});let response:NativeResponse;try{response=await bounded(connection.outcome,connectPhase.signal);}finally{connectPhase.stop();}
  if(c.signal.aborted)throw unavailable();const h=headers(response);const error=responseError(response.status,h);if(error)throw error;
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(h.get('content-type')??'')||h.has('content-encoding')&&h.get('content-encoding')?.toLowerCase()!=='identity')throw invalidResponse();
  const length=h.get('content-length');if(length!==undefined&&(!/^(?:0|[1-9]\d*)$/.test(length)||Number(length)>LIMITS.body))throw invalidResponse();
  const bodyPhase=phase();const iterator=response.body[Symbol.asyncIterator]();const chunks:Uint8Array[]=[];let size=0;try{while(true){const read=iterator.next();let part:IteratorResult<Uint8Array>;try{part=await bounded(read,bodyPhase.signal);}catch(error){firstError=fixedFailure(error);rejectOutcome(firstError);cancel();await read.then(()=>undefined,()=>undefined);throw error;}if(part.done)break;if(!(part.value instanceof Uint8Array)||part.value.byteLength>LIMITS.body-size)throw invalidResponse();size+=part.value.byteLength;chunks.push(part.value);}if(c.signal.aborted||!response.complete()||length!==undefined&&Number(length)!==size)throw invalidResponse();const bytes=Buffer.concat(chunks,size);chunks.length=0;try{return parse(bytes);}catch{throw invalidResponse();}}finally{bodyPhase.stop();}
 }catch(error){firstError??=fixedFailure(error);cancel();throw firstError;}finally{phases.forEach(p=>p.stop());}})();
 const timed=new Promise<T>((resolve,reject)=>{rejectOutcome=reject;work.then(resolve,e=>reject(firstError??e));c.signal.addEventListener('abort',()=>reject(firstError??unavailable()),{once:true});});
 const settled=work.then(()=>undefined,()=>undefined).then(async()=>{await connection?.settled;}).finally(()=>{phases.forEach(p=>p.stop());parent.removeEventListener('abort',relay);nativeRelease();memoryRelease();});
 void timed.catch(()=>{});void settled.catch(()=>{});return {outcome:timed,settled,cancel};
}
export function createGameProviderTransport(options:TransportOptions){
 options={...options,credentials:Object.freeze({...options.credentials})};options.coordinator.bindCredentials(options.credentials);if(options.phaseMs!==undefined&&(!Number.isInteger(options.phaseMs)||options.phaseMs<1||options.phaseMs>5000))throw unavailable();const now=options.coordinator.now;
 let shared=authority.get(options.coordinator);if(!shared){shared={generation:0};authority.set(options.coordinator,shared);}const state=shared;
 const token=(signal:AbortSignal,deps:Promise<void>[]):Promise<Token>=>{if(signal.aborted)return Promise.reject(unavailable());if(state.token&&state.token.expiresAt>now())return Promise.resolve(state.token);if(state.token){state.token=undefined;state.tokenRelease?.();state.tokenRelease=undefined;}
  if(state.flight&&state.flight.waiters>=LIMITS.tokenWaiters)return Promise.reject(busy());if(!state.flight){const generation=++state.generation;const form=new URLSearchParams({client_id:options.credentials.clientId,client_secret:options.credentials.clientSecret,grant_type:'client_credentials'}).toString();const rawOperation=receive(options,'token',form,new AbortController().signal,bytes=>{const value=tokenSchema.parse(parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));return {value:value.access_token,generation,expiresAt:now()+value.expires_in*1000-30000};});const operation:NativeOperation<Token>={...rawOperation,outcome:rawOperation.outcome.then(t=>{if(state.flight===flight&&flight.waiters>0){const release=options.coordinator.reserveMemory(t.value.length*6+512);state.tokenRelease?.();state.tokenRelease=release;state.token=t;}return t;})};const flight:Flight={operation,waiters:0};state.flight=flight;void operation.outcome.catch(()=>{});void operation.settled.then(()=>{if(state.flight===flight)state.flight=undefined;});}
  const flight=state.flight!;flight.waiters++;deps.push(flight.operation.settled);return bounded(flight.operation.outcome,signal).then(t=>{if(t.expiresAt<=now())throw busy();return t;}).finally(()=>{flight.waiters--;if(!flight.waiters)flight.operation.cancel();});
 };
 return {catalog:(query:string,signal:AbortSignal,hooks?:CatalogHooks):NativeOperation<readonly GameProviderRow[]>=>{const c=new AbortController();const abort=()=>c.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)c.abort();let native:NativeOperation<readonly GameProviderRow[]>|undefined;const deps:Promise<void>[]=[];let generation:number|undefined;
  const work=(async()=>{try{if(typeof query!=='string'||!query.length||Buffer.byteLength(query)>16384)throw unavailable();const t=await token(c.signal,deps);generation=t.generation;if(hooks){const authorization=hooks.beforeStart();deps.push(authorization.then(()=>undefined,()=>undefined));await bounded(authorization,c.signal);}if(c.signal.aborted||t.expiresAt<=now())throw unavailable();const headersOptions={...options,beforeConnect:()=>{if(t.expiresAt<=now())throw unavailable();},catalogHeaders:{'Client-ID':options.credentials.clientId,Authorization:`Bearer ${t.value}`}};native=receive(headersOptions,'catalog',query,c.signal,parseGameProviderJson,hooks?.onStart);deps.push(native.settled);return await native.outcome;}catch(error){if(error instanceof Error&&unauthorizedResponses.has(error)&&generation!==undefined&&state.token?.generation===generation){state.token=undefined;state.tokenRelease?.();state.tokenRelease=undefined;}throw error;}})();
  const settled=work.then(()=>undefined,()=>undefined).then(()=>Promise.all(deps).then(()=>undefined)).finally(()=>signal.removeEventListener('abort',abort));void work.catch(()=>{});return {outcome:bounded(work,c.signal),settled,cancel:()=>{c.abort();native?.cancel();}};
 }};
}
