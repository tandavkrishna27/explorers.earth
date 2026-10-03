import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {TcpNetConnectOpts} from 'node:net';
import type {RequestOptions} from 'node:https';
import {request} from 'node:https';

export class BookCoverFetchFailure extends Error {constructor(){super('Book cover unavailable');}}
/** Conservative global-unicast policy. Mapped/translation IPv6 is deliberately refused. */
export function publicAddress(address:string):boolean {
 const family=isIP(address);
 if(family===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);}
 if(family!==6)return false;
 // Only 2000::/3 global unicast; reject special registries and documentation.
 const first=parseInt(address.split(':')[0],16);if(!Number.isFinite(first)||first<0x2000||first>0x3fff)return false;
 const normalized=new URL(`https://[${address}]/`).hostname.slice(1,-1).toLowerCase();
 return !normalized.startsWith('2001:')&&!normalized.startsWith('2002:')&&!normalized.startsWith('3fff:');
}
type Address={address:string;family:number};
type Target=Address&{url:URL;servername:'books.google.com';signal:AbortSignal};
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
export class BookCoverFetcher {
 constructor(private readonly fixture?:Fixture){if(fixture&&fixture.mode!=='deterministic-fixture')throw new BookCoverFetchFailure();}
 async fetch(raw:string):Promise<{bytes:Buffer;mimeType:string}>{
  let u:URL;try{u=new URL(raw);if(raw.length>2048||u.protocol!=='https:'||u.hostname!=='books.google.com'||u.username||u.password||u.port&&u.port!=='443')throw Error();}catch{throw new BookCoverFetchFailure();}
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new BookCoverFetchFailure());},this.fixture?.deadlineMs??5000);});
  try{return await Promise.race([(async()=>{
   const addresses=await (this.fixture?.resolve??(hostname=>lookup(hostname,{all:true,verbatim:true})))(u.hostname);
   if(controller.signal.aborted||!addresses.length||addresses.some(a=>!publicAddress(a.address)||isIP(a.address)!==a.family))throw new BookCoverFetchFailure();
   const response=await (this.fixture?.connect??connect)({...addresses[0],url:u,servername:'books.google.com',signal:controller.signal});
   if(response.status!==200||!['image/png','image/jpeg','image/webp','image/gif'].includes(response.mimeType)||response.length!==undefined&&(!Number.isSafeInteger(response.length)||response.length<1||response.length>5*1024*1024))throw new BookCoverFetchFailure();
   let size=0;const chunks:Buffer[]=[];
   for await(const chunk of response.body){if(controller.signal.aborted)throw new BookCoverFetchFailure();size+=chunk.byteLength;if(size>5*1024*1024)throw new BookCoverFetchFailure();chunks.push(Buffer.from(chunk));}
   const bytes=Buffer.concat(chunks);if(!size||sniff(bytes)!==response.mimeType||response.length!==undefined&&response.length!==size)throw new BookCoverFetchFailure();return {bytes,mimeType:response.mimeType};
  })(),timeout]);}catch{controller.abort();throw new BookCoverFetchFailure();}finally{if(timer)clearTimeout(timer);}
 }
}
