import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {TcpNetConnectOpts} from 'node:net';
import type {RequestOptions} from 'node:https';
import {request} from 'node:https';
import {publicAddress} from './bookCoverFetch';

// A Places list cover. The browser asks Google for the photo with skipHttpRedirect=true and
// sends only the photoUri it answers; this fetches those bytes so the browser never follows
// Google's redirect to googleusercontent.com (which production CSP refuses) and the
// key-bearing media URL is never handed to the server. Same policy as BookCoverFetcher:
// exact host allowlist, vetted public address pinned for the connection, no redirects,
// image types only, 5 MB, 5 s.
export class PlacePhotoFetchFailure extends Error {constructor(){super('Place photo unavailable');}}
const MAX=5*1024*1024;
/** Google's photo CDN shards. Anything else on googleusercontent.com is user content. */
const HOST=/^lh[3-6]\.googleusercontent\.com$/;
type Address={address:string;family:number};
type Target=Address&{url:URL;servername:string;signal:AbortSignal};
type Response={status:number;mimeType:string;body:AsyncIterable<Uint8Array>;length?:number};
type Fixture={mode:'deterministic-fixture';resolve:(hostname:string)=>Promise<Address[]>;connect:(target:Target)=>Promise<Response>;deadlineMs?:number};
function connect(target:Target):Promise<Response>{return new Promise((resolve,reject)=>{
 const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'GET',agent:false,family:target.family,autoSelectFamily:false,servername:target.servername,rejectUnauthorized:true,signal:target.signal,
  lookup:(_hostname,_options,callback)=>callback(null,target.address,target.family)};
 const req=request(target.url,options,res=>resolve({status:res.statusCode??0,mimeType:String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase(),length:res.headers['content-length']===undefined?undefined:Number(res.headers['content-length']),body:res}));
 req.on('error',reject);req.end();
});}
function sniff(b:Buffer){if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';if(b.length>=6&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return 'image/gif';return undefined;}
/** The fixture seam replaces DNS/socket I/O only; every policy check remains above it. */
export class PlacePhotoFetcher {
 constructor(private readonly fixture?:Fixture,private readonly host:RegExp=HOST){if(fixture&&fixture.mode!=='deterministic-fixture')throw new PlacePhotoFetchFailure();}
 async fetch(raw:string):Promise<{bytes:Buffer;mimeType:string}>{
  let u:URL;try{u=new URL(raw);if(raw.length>2048||u.protocol!=='https:'||!this.host.test(u.hostname)||u.username||u.password||u.port&&u.port!=='443')throw Error();}catch{throw new PlacePhotoFetchFailure();}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new PlacePhotoFetchFailure());},this.fixture?.deadlineMs??5000);});
  try{return await Promise.race([(async()=>{
   const addresses=await (this.fixture?.resolve??(hostname=>lookup(hostname,{all:true,verbatim:true})))(u.hostname);
   if(controller.signal.aborted||!addresses.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new PlacePhotoFetchFailure();
   const response=await (this.fixture?.connect??connect)({...addresses[0],url:u,servername:u.hostname,signal:controller.signal});
   if(response.status!==200||!['image/png','image/jpeg','image/webp','image/gif'].includes(response.mimeType)||response.length!==undefined&&(!Number.isSafeInteger(response.length)||response.length<1||response.length>MAX))throw new PlacePhotoFetchFailure();
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of response.body){if(controller.signal.aborted)throw new PlacePhotoFetchFailure();size+=chunk.byteLength;if(size>MAX)throw new PlacePhotoFetchFailure();chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks);if(!size||sniff(bytes)!==response.mimeType||response.length!==undefined&&response.length!==size)throw new PlacePhotoFetchFailure();return {bytes,mimeType:response.mimeType};
  })(),timeout]);}catch{controller.abort();throw new PlacePhotoFetchFailure();}finally{if(timer)clearTimeout(timer);}
 }
}
