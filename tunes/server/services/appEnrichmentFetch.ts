import {lookup} from 'node:dns/promises';
import {isIP,type TcpNetConnectOpts} from 'node:net';
import {request,type RequestOptions} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {publicAddress} from './bookCoverFetch';
export type AppFetchConfig={allowedHosts:readonly string[];redirectPolicy:'deny'|'same-host'|'allowed-hosts';timeoutMs:number;maxBytes:number;maxRedirects:number;maxRequests:number};
export type AppFetchAddress={address:string;family:number};
export type AppFetchTarget={url:URL;address:AppFetchAddress;signal:AbortSignal};
export type AppFetchResponse={status:number;headers:Record<string,string|undefined>;body:AsyncIterable<Uint8Array>;complete:()=>boolean};
export type AppFetchConnection={outcome:Promise<AppFetchResponse>;cancel:()=>void};
export type AppFetchDependencies={resolve?:(host:string)=>Promise<AppFetchAddress[]>;connect?:(target:AppFetchTarget)=>AppFetchConnection};
export type AppFetchOutcome={kind:'success';bytes:Buffer;status:200}|{kind:'unconfigured'|'rejected'|'budget-exceeded'|'aborted'|'timeout'|'unavailable'};
/** Private agents and pinned DNS preserve HTTPS hostname/certificate verification. */
export function connectAppEnrichmentNative(target:AppFetchTarget,httpsRequest:typeof request=request):AppFetchConnection {
 let req:ReturnType<typeof request>|undefined,res:import('node:http').IncomingMessage|undefined;
 const outcome=new Promise<AppFetchResponse>((resolve,reject)=>{try{
  const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'GET',agent:false,family:target.address.family,autoSelectFamily:false,servername:target.url.hostname,rejectUnauthorized:true,checkServerIdentity,signal:target.signal,maxHeaderSize:16384,headers:{Accept:'application/json','Accept-Encoding':'identity',Connection:'close'},lookup:(_host,_options,callback)=>callback(null,target.address.address,target.address.family)};
  req=httpsRequest(target.url,options,message=>{res=message;resolve({status:message.statusCode??0,headers:{location:message.headers.location,'content-length':message.headers['content-length'],'content-encoding':message.headers['content-encoding']},body:message,complete:()=>message.complete});});
  req.maxHeadersCount=64;req.on('error',()=>reject(new Error('App transport unavailable')));req.end();
 }catch{reject(new Error('App transport unavailable'));}});
 return {outcome,cancel:()=>{res?.destroy();req?.destroy();}};
}
class Failure extends Error {constructor(readonly kind:Exclude<AppFetchOutcome['kind'],'success'|'unconfigured'>){super(kind);}}
/** Explicit source configuration only; absent registry entries perform zero I/O. */
export function createAppEnrichmentFetcher(input:AppFetchConfig|null,deps:AppFetchDependencies={}) {
 const config=input?{...input,allowedHosts:[...input.allowedHosts]}:null;
 if(config){
  const limits=[[config.timeoutMs,1,60000],[config.maxBytes,1,10485760],[config.maxRedirects,0,10],[config.maxRequests,1,11],[config.allowedHosts.length,1,32]];
  if(limits.some(([v,min,max])=>!Number.isSafeInteger(v)||v<min||v>max)||!['deny','same-host','allowed-hosts'].includes(config.redirectPolicy)||config.allowedHosts.some(h=>typeof h!=='string'||h.length>253||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(h)||isIP(h)!==0)||new Set(config.allowedHosts).size!==config.allowedHosts.length)throw new Error('Invalid App transport configuration');
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
    if(controller.signal.aborted)throw new Failure(reason);requests++;connection=(deps.connect??connectAppEnrichmentNative)({url,address:{...addresses[0]},signal:controller.signal});
    const response=await bounded(connection.outcome);
    if([301,302,303,307,308].includes(response.status)){
     connection.cancel();if(config.redirectPolicy==='deny')throw new Failure('rejected');if(redirects++>=config.maxRedirects)throw new Failure('budget-exceeded');
     if(!response.headers.location)throw new Failure('rejected');url=urlFor(response.headers.location,url);if(config.redirectPolicy==='same-host'&&url.hostname!==originHost)throw new Failure('rejected');continue;
    }
    if(response.status!==200||response.headers['content-encoding']!==undefined&&response.headers['content-encoding']!=='identity')throw new Failure('unavailable');
    const length=response.headers['content-length'];if(length!==undefined&&(!/^(0|[1-9]\d*)$/.test(length)||Number(length)>config.maxBytes))throw new Failure('budget-exceeded');
    let bytes=0;const chunks:Buffer[]=[],iterator=response.body[Symbol.asyncIterator]();
    while(true){const next=await bounded(iterator.next());if(next.done)break;if(!(next.value instanceof Uint8Array))throw new Failure('unavailable');if(next.value.byteLength>config.maxBytes-bytes)throw new Failure('budget-exceeded');bytes+=next.value.byteLength;chunks.push(Buffer.from(next.value));}
    if(!response.complete()||length!==undefined&&Number(length)!==bytes)throw new Failure('unavailable');return {kind:'success',bytes:Buffer.concat(chunks,bytes),status:200};
   }
  }catch(error){return {kind:error instanceof Failure?error.kind:controller.signal.aborted?reason:'unavailable'};}finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);connection?.cancel();}
 }};
}
