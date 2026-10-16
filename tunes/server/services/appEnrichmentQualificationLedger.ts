import {createHash} from 'node:crypto';
import {types as utilTypes} from 'node:util';
import {z} from 'zod/v3';
import {request as nativeRequest} from 'node:https';
import {validateAppWorkerSources,type ApprovedAppWorkerSource} from '../application/appEnrichmentWorkerValidation';
import {createAppEnrichmentFetcher,connectAppEnrichmentNative,type AppFetchConfig,type AppFetchOutcome} from './appEnrichmentFetch';
export type AppQualificationBounds=Readonly<{maxAttempts:number;maxAdmittedBodyBytes:number;maxDurationMs:number}>;
type Evidence={sourceIdentityHash:string;profile:string;responseStatus?:number;bodyHash?:string;bodyBytes?:number;outcome?:string};
/** These seams are trusted offline tests only; any injected transport marks evidence synthetic. */
type Dependencies={now?:()=>number;createFetcher?:(config:AppFetchConfig)=>{fetch:(url:string,signal?:AbortSignal)=>Promise<AppFetchOutcome>};observeNativeLifecycle?:(event:'request-opened'|'request-closed'|'socket-opened'|'socket-closed',token:symbol)=>void};
function own(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||utilTypes.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)throw Error();const captured:Record<string,unknown>={};for(const key of Reflect.ownKeys(value)){if(typeof key!=='string')throw Error();const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error();Object.defineProperty(captured,key,{value:d.value,enumerable:true});}return captured;}
function canonical(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}';return JSON.stringify(value);}
/** Does no I/O on construction. Outer reservations are conservative body/attempt admissions, not wire totals. */
function createLedger(inputs:readonly ApprovedAppWorkerSource[],input:AppQualificationBounds,deps:Dependencies,maxima:AppQualificationBounds){
 let sources:readonly ApprovedAppWorkerSource[],bounds:AppQualificationBounds;
 try{
  bounds=Object.freeze(z.object({maxAttempts:z.number().int().min(1).max(maxima.maxAttempts),maxAdmittedBodyBytes:z.number().int().min(1).max(maxima.maxAdmittedBodyBytes),maxDurationMs:z.number().int().min(1).max(maxima.maxDurationMs)}).strict().parse(own(input)));
  const expected:string[]=[],raw=inputs.map(value=>{const data=own(value),fingerprint=z.string().regex(/^[a-f0-9]{64}$/).parse(data.configurationFingerprint);expected.push(fingerprint);const {configurationFingerprint:_derived,...source}=data;return source;});sources=validateAppWorkerSources(raw).sources;
  if(!sources.length||sources.some((source,index)=>source.configurationFingerprint!==expected[index]||source.fetch.redirectPolicy!=='deny'||source.fetch.maxRedirects!==0||source.fetch.maxRequests!==1||source.fetch.maxBytes>2097152||source.fetch.allowedHosts.length!==1||source.fetch.allowedHosts[0]!==new URL(source.canonicalUrl).hostname))throw Error();
 }catch{throw new Error('Invalid App qualification ledger');}
 const now=deps.now??Date.now,started=now();if(!Number.isSafeInteger(started)||started<0)throw new Error('Invalid App qualification ledger');
 let admittedAttempts=0,reservedBodyBytes=0,observedResponses=0,successfulBodyBytes=0,firstFailure:string|undefined;
 const records:Evidence[]=[],privateBodies:Array<{sourceIdentityHash:string;bodyHash:string;bytes:Buffer}>=[];
 const failure=(kind:string)=>{firstFailure??=kind;};
 const observer=deps.observeNativeLifecycle;const notify=(event:'request-opened'|'request-closed'|'socket-opened'|'socket-closed',token:symbol)=>{try{observer?.(event,token);}catch{failure('observer-refused');}};
 return Object.freeze({
  fetcher(config:AppFetchConfig){let source:ApprovedAppWorkerSource|undefined;try{source=sources.find(s=>canonical(s.fetch)===canonical(own(config)));}catch{/* Fail closed below. */}if(!source){failure('configuration');throw new Error('Qualification fetch configuration refused');}const approved=source;
   return {async fetch(url:string,signal?:AbortSignal):Promise<AppFetchOutcome>{
    if(firstFailure)return {kind:'rejected'};
    if(url!==approved.canonicalUrl){failure('unexpected-target');return {kind:'rejected'};}
    const time=now();if(!Number.isSafeInteger(time)||time<started||time-started>=bounds.maxDurationMs){failure('runtime');return {kind:'timeout'};}
    if(signal?.aborted)return {kind:'aborted'};
    if(admittedAttempts>=bounds.maxAttempts){failure('request-budget');return {kind:'budget-exceeded'};}
    if(approved.fetch.maxBytes>bounds.maxAdmittedBodyBytes-reservedBodyBytes){failure('byte-budget');return {kind:'budget-exceeded'};}
    admittedAttempts++;reservedBodyBytes+=approved.fetch.maxBytes;const record:Evidence={sourceIdentityHash:approved.identity.sourceIdentityHash,profile:approved.fetch.contentProfile};records.push(record);
    try{
     const fetcher=deps.createFetcher?deps.createFetcher(approved.fetch):createAppEnrichmentFetcher(approved.fetch,{connect:target=>{const connection=connectAppEnrichmentNative(target,observer?((...args:Parameters<typeof nativeRequest>)=>{const request=nativeRequest(...args),token=Symbol();notify('request-opened',token);request.once('close',()=>notify('request-closed',token));request.once('socket',socket=>{const socketToken=Symbol();notify('socket-opened',socketToken);socket.once('close',()=>notify('socket-closed',socketToken));});return request;}) as typeof nativeRequest:undefined);void connection.outcome.then(response=>{observedResponses++;record.responseStatus=response.status;},()=>{});return connection;}});
     const outcome=await fetcher.fetch(url,signal);record.outcome=outcome.kind;
     if(outcome.kind!=='success'){failure('transport-refused');return outcome;}
     if(!Buffer.isBuffer(outcome.bytes)||outcome.bytes.byteLength>approved.fetch.maxBytes){failure('body-budget');return {kind:'budget-exceeded'};}
     const bodyHash=createHash('sha256').update(outcome.bytes).digest('hex');record.bodyHash=bodyHash;record.bodyBytes=outcome.bytes.byteLength;successfulBodyBytes+=outcome.bytes.byteLength;privateBodies.push({sourceIdentityHash:approved.identity.sourceIdentityHash,bodyHash,bytes:Buffer.from(outcome.bytes)});
     return outcome; // Original transport bytes/status, never reconstructed evidence responses.
    }catch{failure('transport-refused');record.outcome='unavailable';return {kind:'unavailable'};}
   }};
  },
  inspect:()=>Object.freeze({nativeTransport:!deps.createFetcher,nativeClock:!deps.now,admittedAttempts,reservedBodyBytes,observedResponses,unknownWireAttempts:admittedAttempts-observedResponses,successfulBodyBytes,...(firstFailure?{firstFailure}:{}),records:Object.freeze(records.map(record=>Object.freeze({...record})))}),
  /** Private root evidence export. Never include these bytes in public receipts or diagnostics. */
  bodies:()=>Object.freeze(privateBodies.map(value=>Object.freeze({...value,bytes:Buffer.from(value.bytes)}))),
 });
}

/** Original Task7 qualification authority, unchanged6/12MiB/120s. */
export function createAppQualificationLedger(inputs:readonly ApprovedAppWorkerSource[],input:AppQualificationBounds,deps:Dependencies={}){return createLedger(inputs,input,deps,{maxAttempts:6,maxAdmittedBodyBytes:12582912,maxDurationMs:120000})}
/** Separately ratified additive4 HTTP/UI authority. Explicit bounds remain required. */
export function createAppsEnrichmentQualificationLedger(inputs:readonly ApprovedAppWorkerSource[],input:AppQualificationBounds,deps:Dependencies={}){return createLedger(inputs,input,deps,{maxAttempts:8,maxAdmittedBodyBytes:16777216,maxDurationMs:600000})}
