import {lookup} from 'node:dns/promises';
import {isIP,type TcpNetConnectOpts} from 'node:net';
import {request,type RequestOptions} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {types as utilTypes} from 'node:util';
import {publicAddress} from './bookCoverFetch';
export type AppContentProfile='html-utf8'|'json-utf8'|'apple-json-utf8';
export type AppFetchConfig={contentProfile:AppContentProfile;allowedHosts:readonly string[];redirectPolicy:'deny'|'same-host'|'allowed-hosts';timeoutMs:number;maxBytes:number;maxRedirects:number;maxRequests:number};
export type AppFetchAddress={address:string;family:number};
export type AppFetchTarget={url:URL;address:AppFetchAddress;signal:AbortSignal;contentProfile:AppContentProfile};
export type AppFetchResponse={status:number;headers:Record<string,string|undefined>;body:AsyncIterable<Uint8Array>;complete:()=>boolean};
export type AppFetchConnection={outcome:Promise<AppFetchResponse>;cancel:()=>void};
export type AppFetchDependencies={resolve?:(host:string)=>Promise<AppFetchAddress[]>;connect?:(target:AppFetchTarget)=>AppFetchConnection};
export type AppFetchOutcome={kind:'success';bytes:Buffer;status:200}|{kind:'http-failure';status:number;retryAfter?:string}|{kind:'unconfigured'|'rejected'|'budget-exceeded'|'aborted'|'timeout'|'unavailable'};
function contentProfileValid(value:unknown):value is AppContentProfile {return value==='html-utf8'||value==='json-utf8'||value==='apple-json-utf8';}
/** Inspect descriptors, never executable configuration properties; validate the captured data below. */
function snapshotFetchConfig(input:unknown):AppFetchConfig {
 try {
  if(!input||typeof input!=='object'||utilTypes.isProxy(input))throw Error();
  const prototype=Object.getPrototypeOf(input);if(prototype!==Object.prototype&&prototype!==null)throw Error();
  const keys=['contentProfile','allowedHosts','redirectPolicy','timeoutMs','maxBytes','maxRedirects','maxRequests'];
  const ownKeys=Reflect.ownKeys(input);if(ownKeys.length!==keys.length||ownKeys.some(key=>typeof key!=='string'||!keys.includes(key)))throw Error();
  const snapshot:Record<string,unknown>=Object.create(null);
  for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(input,key);if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error();snapshot[key]=descriptor.value;}
  const hosts=snapshot.allowedHosts;if(!Array.isArray(hosts)||utilTypes.isProxy(hosts)||Object.getPrototypeOf(hosts)!==Array.prototype)throw Error();
  const length=Object.getOwnPropertyDescriptor(hosts,'length')?.value;if(!Number.isSafeInteger(length)||length<1||length>32||Reflect.ownKeys(hosts).length!==length+1)throw Error();
  const capturedHosts:unknown[]=[];
  for(let i=0;i<length;i++){const descriptor=Object.getOwnPropertyDescriptor(hosts,String(i));if(!descriptor||!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw Error();capturedHosts.push(descriptor.value);}
  snapshot.allowedHosts=capturedHosts;
  return snapshot as AppFetchConfig;
 }catch{throw new Error('Invalid App transport configuration');}
}
/** One MIME and at most one explicit UTF-8 charset; no permissive header fallback. */
function admitsContentType(value:unknown,profile:AppContentProfile):boolean {
 if(typeof value!=='string'||value.length>256)return false;
 const match=/^[\t ]*([a-z]+\/[a-z]+)[\t ]*(?:;[\t ]*charset[\t ]*=[\t ]*(?:utf-8|"utf-8")[\t ]*)?$/i.exec(value);
 if(!match)return false;
 const mime=match[1].toLowerCase();
 switch(profile){case 'html-utf8':return mime==='text/html';case 'json-utf8':return mime==='application/json';case 'apple-json-utf8':return mime==='application/json'||mime==='text/javascript';default:return false;}
}
/** Node may discard duplicate Content-Type fields in its normalized headers. */
function nativeContentType(message:import('node:http').IncomingMessage):string|undefined {
 let count=0,value:string|undefined;
 for(let i=0;i<message.rawHeaders.length;i+=2)if(message.rawHeaders[i].toLowerCase()==='content-type'){count++;value=message.rawHeaders[i+1];}
 return count===1?value:undefined;
}
function safeRetryAfter(value:unknown):string|undefined {
 if(typeof value!=='string'||value.length>128)return undefined;
 if(/^(0|[1-9]\d{0,14})$/.test(value)&&Number.isSafeInteger(Number(value)*1000))return value;
 if(!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value))return undefined;
 const instant=Date.parse(value);return Number.isFinite(instant)&&new Date(instant).toUTCString()===value?value:undefined;
}
/** Parse finite retry hints; callers supply their approved bounds and trusted clock. */
export function parseAppRetryAfter(value:unknown,nowMs:number,bounds:{minMs:number;maxMs:number}):number|null {
 if(!Number.isSafeInteger(nowMs)||nowMs<0||!Number.isSafeInteger(bounds.minMs)||bounds.minMs<1||!Number.isSafeInteger(bounds.maxMs)||bounds.maxMs<bounds.minMs)throw new Error('Invalid App retry policy');
 const hint=safeRetryAfter(value);if(hint===undefined)return null;
 let delay:number;
 if(/^(0|[1-9]\d{0,14})$/.test(hint))delay=Number(hint)*1000;
 else delay=Date.parse(hint)-nowMs;
 return Math.max(bounds.minMs,Math.min(bounds.maxMs,delay));
}
/** Private agents and pinned DNS preserve HTTPS hostname/certificate verification. */
export function connectAppEnrichmentNative(target:AppFetchTarget,httpsRequest:typeof request=request):AppFetchConnection {
 if(!target||typeof target!=='object'||utilTypes.isProxy(target))throw new Error('Invalid App transport configuration');
 const profileDescriptor=Object.getOwnPropertyDescriptor(target,'contentProfile');
 if(!profileDescriptor?.enumerable||!Object.hasOwn(profileDescriptor,'value')||!contentProfileValid(profileDescriptor.value))throw new Error('Invalid App transport configuration');
 const contentProfile:AppContentProfile=profileDescriptor.value;
 let req:ReturnType<typeof request>|undefined,res:import('node:http').IncomingMessage|undefined;
 const outcome=new Promise<AppFetchResponse>((resolve,reject)=>{try{
  const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'GET',agent:false,family:target.address.family,autoSelectFamily:false,servername:target.url.hostname,rejectUnauthorized:true,checkServerIdentity,signal:target.signal,maxHeaderSize:16384,headers:{Accept:contentProfile==='html-utf8'?'text/html':'application/json','Accept-Encoding':'identity',Connection:'close'},lookup:(_host,_options,callback)=>callback(null,target.address.address,target.address.family)};
  req=httpsRequest(target.url,options,message=>{res=message;resolve({status:message.statusCode??0,headers:{location:message.headers.location,'content-type':nativeContentType(message),'content-length':message.headers['content-length'],'content-encoding':message.headers['content-encoding'],'retry-after':safeRetryAfter(message.headers['retry-after'])},body:message,complete:()=>message.complete});});
  req.maxHeadersCount=64;req.on('error',()=>reject(new Error('App transport unavailable')));req.end();
 }catch{reject(new Error('App transport unavailable'));}});
 return {outcome,cancel:()=>{res?.destroy();req?.destroy();}};
}
class Failure extends Error {constructor(readonly kind:Exclude<AppFetchOutcome['kind'],'success'|'unconfigured'|'http-failure'>){super(kind);}}
/** Explicit source configuration only; absent registry entries perform zero I/O. */
export function createAppEnrichmentFetcher(input:AppFetchConfig|null,deps:AppFetchDependencies={}) {
 const config=input===null?null:snapshotFetchConfig(input);
 if(config){
  const limits=[[config.timeoutMs,1,60000],[config.maxBytes,1,10485760],[config.maxRedirects,0,10],[config.maxRequests,1,11],[config.allowedHosts.length,1,32]];
  if(!contentProfileValid(config.contentProfile)||limits.some(([v,min,max])=>!Number.isSafeInteger(v)||v<min||v>max)||!['deny','same-host','allowed-hosts'].includes(config.redirectPolicy)||config.allowedHosts.some(h=>typeof h!=='string'||h.length>253||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(h)||isIP(h)!==0)||new Set(config.allowedHosts).size!==config.allowedHosts.length)throw new Error('Invalid App transport configuration');
 }
 return {async fetch(raw:string,parent?:AbortSignal):Promise<AppFetchOutcome>{
  if(!config)return {kind:'unconfigured'};
  const controller=new AbortController();let reason:'aborted'|'timeout'='aborted';let connection:AppFetchConnection|undefined;
  const abort=()=>{controller.abort();connection?.cancel();};parent?.addEventListener('abort',abort,{once:true});if(parent?.aborted)abort();
  const timer=setTimeout(()=>{reason='timeout';abort();},config.timeoutMs);
  const bounded=<T>(promise:Promise<T>)=>new Promise<T>((resolve,reject)=>{const fail=()=>reject(new Failure(reason));if(controller.signal.aborted){fail();return;}controller.signal.addEventListener('abort',fail,{once:true});promise.then(resolve,reject).finally(()=>controller.signal.removeEventListener('abort',fail)).catch(()=>{});});
  const urlFor=(value:string,base?:URL)=>{try{if(typeof value!=='string'||value.length>4096||/[\x00-\x20\x7f\\]/.test(value))throw Error();const url=new URL(value,base);if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port&&url.port!=='443'||!config.allowedHosts.includes(url.hostname))throw Error();return url;}catch{throw new Failure('rejected');}};
  try{
   let url=urlFor(raw),redirects=0,requests=0;const originHost=url.hostname;
   for(;;){
    if(controller.signal.aborted)throw new Failure(reason);if(requests>=config.maxRequests)throw new Failure('budget-exceeded');
    const addresses=await bounded((deps.resolve??(host=>lookup(host,{all:true,verbatim:true})))(url.hostname));
    if(!Array.isArray(addresses)||!addresses.length||addresses.length>64||addresses.some(a=>!a||isIP(a.address)!==a.family||!publicAddress(a.address)))throw new Failure('rejected');
    if(controller.signal.aborted)throw new Failure(reason);requests++;connection=(deps.connect??connectAppEnrichmentNative)({url,address:{...addresses[0]},signal:controller.signal,contentProfile:config.contentProfile});
    const response=await bounded(connection.outcome);
    if([301,302,303,307,308].includes(response.status)){
     connection.cancel();if(config.redirectPolicy==='deny')throw new Failure('rejected');if(redirects++>=config.maxRedirects)throw new Failure('budget-exceeded');
     if(!response.headers.location)throw new Failure('rejected');url=urlFor(response.headers.location,url);if(config.redirectPolicy==='same-host'&&url.hostname!==originHost)throw new Failure('rejected');continue;
    }
    if(Number.isInteger(response.status)&&response.status>=400&&response.status<=599){const retry=safeRetryAfter(response.headers['retry-after']);return {kind:'http-failure',status:response.status,...(retry===undefined?{}:{retryAfter:retry})};}
    if(response.status!==200||response.headers['content-encoding']!==undefined&&response.headers['content-encoding']!=='identity')throw new Failure('unavailable');
    if(!admitsContentType(response.headers['content-type'],config.contentProfile))throw new Failure('unavailable');
    const length=response.headers['content-length'];if(length!==undefined&&(!/^(0|[1-9]\d*)$/.test(length)||Number(length)>config.maxBytes))throw new Failure('budget-exceeded');
    let bytes=0;const chunks:Buffer[]=[],iterator=response.body[Symbol.asyncIterator]();
    while(true){const next=await bounded(iterator.next());if(next.done)break;if(!(next.value instanceof Uint8Array))throw new Failure('unavailable');if(next.value.byteLength>config.maxBytes-bytes)throw new Failure('budget-exceeded');bytes+=next.value.byteLength;chunks.push(Buffer.from(next.value));}
    if(!response.complete()||length!==undefined&&Number(length)!==bytes)throw new Failure('unavailable');return {kind:'success',bytes:Buffer.concat(chunks,bytes),status:200};
   }
  }catch(error){return {kind:error instanceof Failure?error.kind:controller.signal.aborted?reason:'unavailable'};}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);connection?.cancel();}
 }};
}
