import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import type {RequestOptions} from 'node:https';
import type {TcpNetConnectOpts} from 'node:net';
import {guardLinkPreviewTarget,LinkPreviewBlocked,type Address,type Resolver} from './linkPreviewGuard';

export const LINK_PREVIEW_TIMEOUT_MS=5000;
export const LINK_PREVIEW_MAX_HTML_BYTES=1048576;
export const LINK_PREVIEW_MAX_IMAGE_BYTES=5242880;
export const LINK_PREVIEW_MAX_REDIRECTS=3;
const USER_AGENT='explorers-link-preview/1 (+owner-initiated)';
const HTML_TYPES=['text/html','application/xhtml+xml'];
const IMAGE_TYPES=['image/jpeg','image/png','image/webp','image/gif'];
const JSON_TYPES=['application/json','text/javascript','application/javascript'];

export class LinkPreviewUnavailable extends Error{constructor(){super('LINK_PREVIEW_UNAVAILABLE');}}
export type ConnectTarget={url:URL;address:Address;signal:AbortSignal;headers:Record<string,string>;port?:number};
export type ConnectResponse={status:number;location?:string;contentType:string;length?:number;body:AsyncIterable<Uint8Array>};
export type LinkPreviewFetchDeps={
 resolve?:Resolver;
 connect?:(target:ConnectTarget)=>Promise<ConnectResponse>;
 /** Test-only: see GuardOptions. Production wiring never sets it. */
 allowLoopbackForTest?:boolean;
 timeoutMs?:number;
};

/** One pinned socket: the resolved address is used directly, TLS is verified against the URL host, no agent (no pooling, no cookies). */
export function connectPinned(target:ConnectTarget):Promise<ConnectResponse>{return new Promise((resolve,reject)=>{
 const https=target.url.protocol==='https:';
 const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'GET',agent:false,family:target.address.family,autoSelectFamily:false,rejectUnauthorized:true,signal:target.signal,headers:target.headers,
  ...(https?{servername:target.url.hostname}:{}),...(target.port?{port:target.port}:{}),
  lookup:(_hostname,_options,callback)=>callback(null,target.address.address,target.address.family)};
 const req=(https?httpsRequest:httpRequest)(target.url,options,res=>{
  const length=res.headers['content-length'];
  resolve({status:res.statusCode??0,location:typeof res.headers.location==='string'?res.headers.location:undefined,contentType:String(res.headers['content-type']??''),length:length===undefined?undefined:Number(length),body:res});
 });
 req.on('error',reject);req.end();
});}

function sniff(b:Buffer){if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';if(b.length>=6&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return 'image/gif';return undefined;}

type Policy={types:string[];maxBytes:number;accept:string;allowedHosts?:readonly string[]};
async function fetchBounded(raw:string,deps:LinkPreviewFetchDeps,policy:Policy):Promise<{url:string;mimeType:string;bytes:Buffer}>{
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new LinkPreviewUnavailable());},deps.timeoutMs??LINK_PREVIEW_TIMEOUT_MS);});
 const run=async()=>{
  let current=raw;
  for(let hop=0;;hop++){
   // Every hop, including the first, is re-guarded: DNS resolve, all-addresses-public, pinned socket address.
   const {url,address}=await guardLinkPreviewTarget(current,deps.resolve,{allowLoopbackForTest:deps.allowLoopbackForTest===true});
   if(policy.allowedHosts&&!policy.allowedHosts.includes(url.hostname))throw new LinkPreviewBlocked();
   if(controller.signal.aborted)throw new LinkPreviewUnavailable();
   const response=await (deps.connect??connectPinned)({url,address,signal:controller.signal,headers:{Accept:policy.accept,'User-Agent':USER_AGENT}});
   if([301,302,303,307,308].includes(response.status)){
    if(hop>=LINK_PREVIEW_MAX_REDIRECTS||!response.location)throw new LinkPreviewUnavailable();
    let next:URL;try{next=new URL(response.location,url);}catch{throw new LinkPreviewBlocked();}
    if(url.protocol==='https:'&&next.protocol!=='https:')throw new LinkPreviewBlocked();
    current=next.href;continue;
   }
   const mimeType=response.contentType.split(';')[0].trim().toLowerCase();
   if(response.status!==200||!policy.types.includes(mimeType))throw new LinkPreviewUnavailable();
   if(response.length!==undefined&&(!Number.isSafeInteger(response.length)||response.length<0||response.length>policy.maxBytes))throw new LinkPreviewUnavailable();
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of response.body){if(controller.signal.aborted)throw new LinkPreviewUnavailable();size+=chunk.byteLength;if(size>policy.maxBytes)throw new LinkPreviewUnavailable();chunks.push(Buffer.from(chunk));}
   return {url:url.href,mimeType,bytes:Buffer.concat(chunks)};
  }
 };
 try{return await Promise.race([run(),timeout]);}
 catch(error){controller.abort();if(error instanceof LinkPreviewBlocked)throw error;throw new LinkPreviewUnavailable();}
 finally{if(timer)clearTimeout(timer);}
}

/** Owner-pasted page: html/xhtml only, 1 MiB cap, at most 3 re-guarded redirects, 5 s for the whole operation. */
export async function fetchLinkPreviewDocument(raw:string,deps:LinkPreviewFetchDeps={}):Promise<{url:string;html:string}>{
 const r=await fetchBounded(raw,deps,{types:HTML_TYPES,maxBytes:LINK_PREVIEW_MAX_HTML_BYTES,accept:'text/html'});
 return {url:r.url,html:r.bytes.toString('utf8')};
}
/** Image import: jpeg/png/webp/gif, 5 MiB cap, magic bytes must match the declared type. */
export async function fetchLinkPreviewImage(raw:string,deps:LinkPreviewFetchDeps={}):Promise<{bytes:Buffer;mimeType:string}>{
 const r=await fetchBounded(raw,deps,{types:IMAGE_TYPES,maxBytes:LINK_PREVIEW_MAX_IMAGE_BYTES,accept:IMAGE_TYPES.join(', ')});
 if(!r.bytes.length||sniff(r.bytes)!==r.mimeType)throw new LinkPreviewUnavailable();
 return {bytes:r.bytes,mimeType:r.mimeType};
}
/** JSON from an exact host allowlist (every hop must stay on it). */
export async function fetchLinkPreviewJson(raw:string,allowedHosts:readonly string[],deps:LinkPreviewFetchDeps={}):Promise<unknown>{
 const r=await fetchBounded(raw,deps,{types:JSON_TYPES,maxBytes:LINK_PREVIEW_MAX_HTML_BYTES,accept:'application/json',allowedHosts});
 try{return JSON.parse(r.bytes.toString('utf8'));}catch{throw new LinkPreviewUnavailable();}
}
