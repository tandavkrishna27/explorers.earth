import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import type {TcpNetConnectOpts} from 'node:net';
import {request,type RequestOptions} from 'node:https';
import {publicAddress} from './bookCoverFetch';
import {movieDetailsSchema,type MovieDetails} from '../../shared/explorersMovieContract';
import type {MovieMediaSlot} from '../../shared/explorersMovieMediaContract';
export class MovieImageFailure extends Error {constructor(){super('Movie image unavailable');}}
const MAX=5*1024*1024;
export function canonicalMovieImageUrl(raw:string,kind:MovieMediaSlot['kind']):string {
 const rendition=kind==='poster'?'w780':kind==='backdrop'?'w1280':'w185';
 if(typeof raw!=='string'||raw.length>2048||!new RegExp(`^https://image\\.tmdb\\.org/t/p/${rendition}/[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp|gif)$`).test(raw))throw new MovieImageFailure();
 const u=new URL(raw);if(u.href!==raw||u.username||u.password||u.port||u.search||u.hash)throw new MovieImageFailure();return raw;
}
export function extractMovieImageSlots(raw:MovieDetails):Array<{slot:MovieMediaSlot;url:string|null}> {
 const d=movieDetailsSchema.parse(raw);
 return [{slot:{kind:'poster'},url:d.posterUrl},{slot:{kind:'backdrop'},url:d.backdropUrl},...d.cast.slice(0,10).map((c,ordinal)=>({slot:{kind:'cast' as const,ordinal,personId:c.personId,creditId:c.creditId},url:c.profileUrl}))];
}
type Address={address:string;family:number};
type Target=Address&{url:URL;servername:'image.tmdb.org';signal:AbortSignal};
type Response={status:number;mimeType:string;body:AsyncIterable<Uint8Array>;length?:number;settlement?:Promise<void>;discard?:()=>void|Promise<void>};
type OwnedConnection={completion:Promise<Response>;settlement:Promise<void>;abort:()=>void};
type Fixture={mode:'deterministic-fixture';resolve:(hostname:string)=>Promise<Address[]>;connect:(target:Target)=>Promise<Response>;deadlineMs?:number};
function connect(target:Target):OwnedConnection {
 let finishRequest!:()=>void,finishResponse!:()=>void,finishSocket!:()=>void,hasResponse=false,hasSocket=false;
 const requestClosed=new Promise<void>(r=>{finishRequest=r;}),responseClosed=new Promise<void>(r=>{finishResponse=r;}),socketClosed=new Promise<void>(r=>{finishSocket=r;});
 let req:ReturnType<typeof request>,response:import('node:http').IncomingMessage|undefined;
 const completion=new Promise<Response>((resolve,reject)=>{
  const options:RequestOptions&Pick<TcpNetConnectOpts,'autoSelectFamily'>={method:'GET',agent:false,family:target.family,autoSelectFamily:false,servername:target.servername,rejectUnauthorized:true,signal:target.signal,lookup:(_h,_o,callback)=>callback(null,target.address,target.family)};
  req=request(target.url,options,res=>{
   hasResponse=true;response=res;res.once('close',finishResponse);
   resolve({status:res.statusCode??0,mimeType:String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase(),length:res.headers['content-length']===undefined?undefined:Number(res.headers['content-length']),body:res,discard:()=>{res.destroy();}});
  });
  req.on('error',reject);req.on('socket',socket=>{hasSocket=true;socket.once('close',finishSocket);});
  req.once('close',()=>{finishRequest();if(!hasResponse)finishResponse();if(!hasSocket)finishSocket();});req.end();
 });
 void completion.catch(()=>{if(!req){finishRequest();finishResponse();finishSocket();}});
 return {completion,settlement:Promise.all([requestClosed,responseClosed,socketClosed]).then(()=>undefined),abort:()=>{response?.destroy();req?.destroy();}};
}
function sniff(b:Buffer):string|undefined {if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255)return 'image/jpeg';if(b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'image/webp';if(b.length>=6&&/^GIF8[79]a$/.test(b.toString('ascii',0,6)))return 'image/gif';return undefined;}
export type OwnedMovieImage={completion:Promise<{bytes:Buffer;mimeType:string}>;settlement:Promise<void>;nativeResult:Promise<{bytes:Buffer;mimeType:string}>;acceptedBytes:()=>number;abort:()=>void};
/** Fixture replaces DNS/socket only; production policy and body accounting are identical. */
export class MovieImageFetcher {
 constructor(private readonly fixture?:Fixture){if(fixture&&(fixture.mode!=='deterministic-fixture'||fixture.deadlineMs!==undefined&&(!Number.isSafeInteger(fixture.deadlineMs)||fixture.deadlineMs<1||fixture.deadlineMs>5000)))throw new MovieImageFailure();}
 fetchOwned(raw:string,kind:MovieMediaSlot['kind'],beforePhase:(phase:'dns'|'connect'|'body')=>Promise<void>=async()=>undefined):OwnedMovieImage {
  const url=new URL(canonicalMovieImageUrl(raw,kind)),controller=new AbortController();let accepted=0,timer:ReturnType<typeof setTimeout>;
  let phaseRejected=false,phaseError:unknown;let resource:OwnedConnection|undefined,response:Response|undefined,iterator:AsyncIterator<Uint8Array>|undefined,discardedResponse:Response|undefined,returnedIterator:AsyncIterator<Uint8Array>|undefined,discardedResource:OwnedConnection|undefined,disposal:Promise<void>=Promise.resolve();
  const discard=()=>{
   const work:Promise<unknown>[]=[disposal];
   if(response&&response!==discardedResponse){discardedResponse=response;try{work.push(Promise.resolve(response.discard?.()));}catch{}}
   if(iterator&&iterator!==returnedIterator){returnedIterator=iterator;try{if(iterator.return)work.push(Promise.resolve(iterator.return()));}catch{}}
   disposal=Promise.all(work.map(p=>p.then(()=>undefined,()=>undefined))).then(()=>undefined);
   if(resource&&resource!==discardedResource){discardedResource=resource;resource.abort();}
  };
  const admitPhase=async(phase:'dns'|'connect'|'body')=>{try{await beforePhase(phase);}catch(error){phaseRejected=true;phaseError=error;throw error;}};
  const nativeResult=(async()=>{
   try {
    await admitPhase('dns');if(controller.signal.aborted)throw new MovieImageFailure();
    const addresses=await(this.fixture?.resolve??(host=>lookup(host,{all:true,verbatim:true})))(url.hostname);
    if(controller.signal.aborted||!addresses.length||addresses.length>64||addresses.some(a=>isIP(a.address)!==a.family||!publicAddress(a.address)))throw new MovieImageFailure();
    await admitPhase('connect');if(controller.signal.aborted)throw new MovieImageFailure();
    const target={...addresses[0],url,servername:'image.tmdb.org' as const,signal:controller.signal};
    if(this.fixture)response=await this.fixture.connect(target);else {resource=connect(target);response=await resource.completion;}
    iterator=response.body[Symbol.asyncIterator]();
    if(controller.signal.aborted||response.status!==200||!['image/png','image/jpeg','image/webp','image/gif'].includes(response.mimeType)||response.length!==undefined&&(!Number.isSafeInteger(response.length)||response.length<1||response.length>MAX))throw new MovieImageFailure();
    await admitPhase('body');if(controller.signal.aborted)throw new MovieImageFailure();
    const chunks:Buffer[]=[];
    for await(const chunk of {[Symbol.asyncIterator]:()=>iterator!}){
     if(controller.signal.aborted||!(chunk instanceof Uint8Array)||chunk.byteLength>MAX-accepted)throw new MovieImageFailure();
     accepted+=chunk.byteLength;chunks.push(Buffer.from(chunk));
    }
    if(controller.signal.aborted||!accepted||response.length!==undefined&&response.length!==accepted)throw new MovieImageFailure();
    const bytes=Buffer.concat(chunks,accepted);if(sniff(bytes)!==response.mimeType)throw new MovieImageFailure();return {bytes,mimeType:response.mimeType};
   }catch{controller.abort();discard();if(phaseRejected)throw phaseError;throw new MovieImageFailure();}
  })();
  const settlement=nativeResult.then(()=>undefined,()=>undefined).then(async()=>{await disposal;await resource?.settlement;await response?.settlement;});
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();discard();reject(new MovieImageFailure());},this.fixture?.deadlineMs??5000);});
  const completion=Promise.race([nativeResult,deadline]).finally(()=>clearTimeout(timer!));
  return {completion,settlement,nativeResult,acceptedBytes:()=>accepted,abort:()=>{controller.abort();discard();}};
 }
}
