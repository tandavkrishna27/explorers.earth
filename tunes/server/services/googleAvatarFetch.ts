import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {TcpNetConnectOpts} from 'node:net';
import type {RequestOptions} from 'node:https';
import {request} from 'node:https';
import {publicAddress} from './bookCoverFetch';

export class GoogleAvatarFetchFailure extends Error {constructor(){super('Google profile photo unavailable');}}
const MAX=5*1024*1024;
/** Only Google's profile photo hosts; anything else is refused before DNS. Asks for a profile-sized rendition. */
export function googleAvatarUrl(raw:string):URL {
 let u:URL;try{u=new URL(raw);}catch{throw new GoogleAvatarFetchFailure();}
 if(raw.length>2048||u.protocol!=='https:'||!/^lh[3-6]\.googleusercontent\.com$/.test(u.hostname)||u.username||u.password||u.port&&u.port!=='443')throw new GoogleAvatarFetchFailure();
 u.pathname=u.pathname.replace(/=s\d+-c$/,'=s512-c');return u;
}
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
/** Same byte policy as BookCoverFetcher: pinned public IP, no redirects, image allowlist, 5 MB, 5 s. */
export class GoogleAvatarFetcher {
 constructor(private readonly fixture?:Fixture){if(fixture&&fixture.mode!=='deterministic-fixture')throw new GoogleAvatarFetchFailure();}
 async fetch(raw:string):Promise<{bytes:Buffer;mimeType:string}>{
  const u=googleAvatarUrl(raw);
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new GoogleAvatarFetchFailure());},this.fixture?.deadlineMs??5000);});
  try{return await Promise.race([(async()=>{
   const addresses=await (this.fixture?.resolve??(hostname=>lookup(hostname,{all:true,verbatim:true})))(u.hostname);
   if(controller.signal.aborted||!addresses.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new GoogleAvatarFetchFailure();
   const response=await (this.fixture?.connect??connect)({...addresses[0],url:u,servername:u.hostname,signal:controller.signal});
   if(response.status!==200||!['image/png','image/jpeg','image/webp','image/gif'].includes(response.mimeType)||response.length!==undefined&&(!Number.isSafeInteger(response.length)||response.length<1||response.length>MAX))throw new GoogleAvatarFetchFailure();
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of response.body){if(controller.signal.aborted)throw new GoogleAvatarFetchFailure();size+=chunk.byteLength;if(size>MAX)throw new GoogleAvatarFetchFailure();chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks);if(!size||sniff(bytes)!==response.mimeType||response.length!==undefined&&response.length!==size)throw new GoogleAvatarFetchFailure();return {bytes,mimeType:response.mimeType};
  })(),timeout]);}catch{controller.abort();throw new GoogleAvatarFetchFailure();}finally{if(timer)clearTimeout(timer);}
 }
}
