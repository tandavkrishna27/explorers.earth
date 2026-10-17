import {randomUUID} from 'node:crypto';
import {Worker,type WorkerOptions} from 'node:worker_threads';
import {types as utilTypes} from 'node:util';
import {z} from 'zod/v3';
import {appSnapshotFieldsSchema,appSourceIdentitySchema} from '../../shared/explorersAppEnrichmentContract';
import {validateProviderParsingPolicy,resolveWebsiteIdentity,resolveAppleIdentity,type AppProviderParsingPolicy,type AppDecodedOutcome} from '../application/appEnrichmentProviderCore.mjs';

export type AppDecoderIsolationPolicy=Readonly<{maxOldGenerationSizeMb:number;maxYoungGenerationSizeMb:number;stackSizeMb:number;maxConcurrentDecoders:number;cleanupTimeoutMs:number}>;
export type AppDecoderCustody={withAdmission:<T>(signal:AbortSignal,work:()=>Promise<T>)=>Promise<T>;fatal:(code:'decoder-unsettled')=>never};
export type AppOwnedDecodeInput={bytes:Buffer;identity:z.infer<typeof appSourceIdentitySchema>;observedAt:string;signal:AbortSignal;deadlineMs:number};
type OwnedThread=Pick<Worker,'on'|'removeListener'|'postMessage'|'terminate'>;
/** Trusted injection seam only; never part of provider configuration or request data. */
export type AppOwnedDecoderDependencies={now?:()=>number;spawn?:(entry:URL,options:WorkerOptions)=>OwnedThread};
const maxResultBytes=32768;
const unavailable=()=>new Error('App decoder unavailable');
const custodyFailures=new WeakSet<object>();
const issuedCustody=new WeakMap<AppDecoderCustody,{policy:AppDecoderIsolationPolicy;cap:number}>();
function custodyFailure(){const error=new Error('App decoder unsettled');custodyFailures.add(error);return error;}
export function isAppDecoderCustodyFailure(error:unknown):boolean{return typeof error==='object'&&error!==null&&custodyFailures.has(error);}
function ownData(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||utilTypes.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)throw unavailable();
 const result:Record<string,unknown>={};
 for(const key of Reflect.ownKeys(input)){if(typeof key!=='string')throw unavailable();const descriptor=Object.getOwnPropertyDescriptor(input,key);if(!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw unavailable();Object.defineProperty(result,key,{value:descriptor.value,enumerable:true});}
 return result;
}
const positive=z.number().int().positive().safe();
const duration=positive.max(2147483647);
const isolationSchema=z.object({maxOldGenerationSizeMb:positive,maxYoungGenerationSizeMb:positive,stackSizeMb:positive,maxConcurrentDecoders:positive,cleanupTimeoutMs:duration}).strict();
function isolationPolicy(input:unknown):AppDecoderIsolationPolicy{try{return Object.freeze(isolationSchema.parse(ownData(input)));}catch{throw new Error('Invalid App decoder isolation policy');}}
export {isolationPolicy as validateAppDecoderIsolationPolicy};
/** Verifies constructor-issued authority without reading supplied custody properties. */
export function validateAppDecoderCustody(custody:AppDecoderCustody,input:AppDecoderIsolationPolicy):number{const policy=isolationPolicy(input),issued=issuedCustody.get(custody);if(!issued||Object.keys(policy).some(key=>policy[key as keyof AppDecoderIsolationPolicy]!==issued.policy[key as keyof AppDecoderIsolationPolicy]))throw new Error('Invalid App decoder custody');return issued.cap;}
/** Instantiate once per run and share between every provider factory. Admission is never queued. */
export function createAppDecoderCustody(input:AppDecoderIsolationPolicy,fatal:(code:'decoder-unsettled')=>unknown,jobConcurrency:number):AppDecoderCustody{
 const policy=isolationPolicy(input);if(typeof fatal!=='function'||!positive.safeParse(jobConcurrency).success)throw new Error('Invalid App decoder custody');
 const cap=Math.min(policy.maxConcurrentDecoders,jobConcurrency);let active=0,closed=false;
 const custody=Object.freeze({async withAdmission<T>(signal:AbortSignal,work:()=>Promise<T>):Promise<T>{if(closed)throw custodyFailure();if(signal.aborted||active>=cap)throw unavailable();active++;try{return await work();}finally{active--;}},fatal(code:'decoder-unsettled'):never{if(!closed){closed=true;try{fatal(code);}catch{/* Custody remains permanently closed regardless of supervisor behavior. */}}throw custodyFailure();}});
 issuedCustody.set(custody,{policy,cap});return custody;
}
function readResult(value:unknown):AppDecodedOutcome{
 const envelope=ownData(value);if(envelope.kind==='unavailable'&&Object.keys(envelope).length===1)return Object.freeze({kind:'unavailable'});
 if(envelope.kind!=='fields'||Object.keys(envelope).length!==2||!Object.hasOwn(envelope,'fields'))throw unavailable();
 const fields=ownData(envelope.fields),keys=Object.keys(fields);if(!keys.length||keys.some(key=>!['title','description','priceTier','platforms'].includes(key)))throw unavailable();
 for(const [key,v]of Object.entries(fields)){
  if(key==='title'&&(typeof v!=='string'||v.length>1000)||key==='description'&&(typeof v!=='string'||v.length>8192)||key==='priceTier'&&(typeof v!=='string'||v.length>100))throw unavailable();
  if(key==='platforms'&&(!Array.isArray(v)||utilTypes.isProxy(v)||v.length>16||v.some(item=>typeof item!=='string'||item.length>100)))throw unavailable();
 }
 if(Buffer.byteLength(JSON.stringify(envelope))>maxResultBytes)throw unavailable();
 const parsed=appSnapshotFieldsSchema.parse(fields);if(parsed.platforms)Object.freeze(parsed.platforms);return Object.freeze({kind:'fields',fields:Object.freeze(parsed)});
}
export function createOwnedAppDecoder(adapterKind:'website'|'apple',parsingInput:AppProviderParsingPolicy,isolationInput:AppDecoderIsolationPolicy,custody:AppDecoderCustody,deps:AppOwnedDecoderDependencies={}){
 if(!['website','apple'].includes(adapterKind))throw new Error('Invalid App decoder configuration');
 const parsingPolicy=validateProviderParsingPolicy(parsingInput),policy=isolationPolicy(isolationInput);validateAppDecoderCustody(custody,policy);const now=deps.now??Date.now;
 const instant=()=>{const n=now();if(!Number.isSafeInteger(n)||n<0)throw unavailable();return n;};
 return async(input:AppOwnedDecodeInput):Promise<AppDecodedOutcome>=>{
  let captured:AppOwnedDecodeInput;
  try{
   const data=ownData(input);if(Object.keys(data).length!==5||Object.keys(data).some(key=>!['bytes','identity','observedAt','signal','deadlineMs'].includes(key)))throw unavailable();
   captured=data as unknown as AppOwnedDecodeInput;
   if(!Buffer.isBuffer(captured.bytes)||utilTypes.isProxy(captured.bytes)||captured.bytes.byteLength>parsingPolicy.maxInputBytes||!(captured.signal instanceof AbortSignal)||!Number.isSafeInteger(captured.deadlineMs))throw unavailable();
   const identity=appSourceIdentitySchema.parse(ownData(captured.identity));
   if(adapterKind==='website')resolveWebsiteIdentity(identity);else resolveAppleIdentity(identity);
   const observedAt=z.string().datetime({offset:true}).parse(captured.observedAt);
   captured={...captured,identity:Object.freeze(identity),observedAt};
   if(captured.signal.aborted||captured.deadlineMs<=instant()||captured.deadlineMs-instant()>2147483647)throw unavailable();
  }catch{throw unavailable();}
  return custody.withAdmission(captured.signal,()=>new Promise<AppDecodedOutcome>((resolve,reject)=>{
   let worker:OwnedThread,remaining:number;try{remaining=captured.deadlineMs-instant();if(captured.signal.aborted||remaining<=0)throw unavailable();captured={...captured,bytes:Buffer.from(captured.bytes)};worker=(deps.spawn??((entry,options)=>new Worker(entry,options)))(new URL('./appEnrichmentDecoderThread.mjs',import.meta.url),{env:{},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:policy.maxOldGenerationSizeMb,maxYoungGenerationSizeMb:policy.maxYoungGenerationSizeMb,stackSizeMb:policy.stackSizeMb}});}catch{reject(unavailable());return;}
   const controlId=randomUUID();let settled=false,failed=false,seen=false,exited=false,terminating=false,terminationSettled=false,terminationFailed=false,candidate:AppDecodedOutcome|undefined;
   let cleanupTimer:ReturnType<typeof setTimeout>|undefined;
   const deadlineTimer=setTimeout(()=>stop(),Math.max(1,remaining));
   const clean=()=>{clearTimeout(deadlineTimer);if(cleanupTimer)clearTimeout(cleanupTimer);captured.signal.removeEventListener('abort',stop);worker.removeListener('message',message);worker.removeListener('error',error);worker.removeListener('exit',exit);};
   const finish=()=>{if(settled||!exited||terminating&&!terminationSettled&&!terminationFailed)return;settled=true;clean();try{if(failed||!candidate||captured.signal.aborted||instant()>=captured.deadlineMs){reject(unavailable());return;}resolve(candidate);}catch{reject(unavailable());}};
   const fatal=()=>{if(settled)return;settled=true;clean();const branded=custodyFailure();try{custody.fatal('decoder-unsettled');}catch{/* Preserve the private custody brand even when the supervisor throws. */}const sink=()=>{},release=()=>{worker.removeListener('error',sink);worker.removeListener('exit',release);};worker.on('error',sink);worker.on('exit',release);reject(branded);};
   const armCleanup=()=>{if(cleanupTimer)clearTimeout(cleanupTimer);cleanupTimer=setTimeout(fatal,policy.cleanupTimeoutMs);};
   function stop(){if(settled)return;failed=true;if(terminating)return;terminating=true;armCleanup();try{Promise.resolve(worker.terminate()).then(()=>{terminationSettled=true;finish();},()=>{terminationFailed=true;if(exited)finish();});}catch{terminationFailed=true;if(exited)finish();}}
   function message(value:unknown){if(settled||failed)return;try{if(seen)throw unavailable();seen=true;const data=ownData(value);if(Object.keys(data).length!==3||data.version!==1||data.controlId!==controlId||!Object.hasOwn(data,'result'))throw unavailable();candidate=readResult(data.result);if(instant()>=captured.deadlineMs||captured.signal.aborted)throw unavailable();if(cleanupTimer)clearTimeout(cleanupTimer);cleanupTimer=setTimeout(stop,policy.cleanupTimeoutMs);}catch{stop();}}
   function error(){stop();}
   function exit(code:number){exited=true;if(code!==0)failed=true;if(terminating&&!terminationSettled&&!terminationFailed)return;finish();}
   worker.on('message',message);worker.on('error',error);worker.on('exit',exit);captured.signal.addEventListener('abort',stop,{once:true});
   try{if(captured.signal.aborted||instant()>=captured.deadlineMs){stop();return;}worker.postMessage({version:1,controlId,adapterKind,identity:captured.identity,observedAt:captured.observedAt,bytes:captured.bytes,parsingPolicy});}catch{stop();}
  }));
 };
}
