import type {Pool} from 'pg';
import type {Actor} from './actor';
import {authorizeOperation} from './authorization';
import {MediaService} from './media';
import type {RequestContext} from '../../shared/explorersContract';
import {linkPreviewImageRequestSchema,linkPreviewRequestSchema,linkPreviewSchema,type LinkPreview} from '../../shared/explorersLinkPreviewContract';
import {fetchLinkPreviewDocument,fetchLinkPreviewImage,fetchLinkPreviewJson,LinkPreviewUnavailable,type LinkPreviewFetchDeps} from '../services/linkPreviewFetch';
import {LinkPreviewBlocked} from '../services/linkPreviewGuard';
import {oembedEndpoint,parseLinkPreview} from '../services/linkPreviewParse';
import {searchAppleApps,AppleSearchInputError,type AppleAppCandidate,type AppleGet} from '../services/appleSearch';
import type {ObjectStorage} from '../services/objectStorage';

export class LinkPreviewRateLimited extends Error{constructor(readonly retryAfterSeconds:number){super('LINK_PREVIEW_RATE_LIMITED');}}
export class LinkPreviewInputError extends Error{constructor(message='Invalid link preview request'){super(message);}}

/** In-memory sliding window per actor. Single-instance server, so memory is the whole state. */
class ActorWindow{
 private readonly hits=new Map<string,number[]>();
 constructor(private readonly limit:number,private readonly windowMs:number,private readonly now:()=>number){}
 take(key:string){
  const t=this.now(),recent=(this.hits.get(key)??[]).filter(x=>t-x<this.windowMs);
  if(recent.length>=this.limit){this.hits.set(key,recent);throw new LinkPreviewRateLimited(Math.max(1,Math.ceil((recent[0]+this.windowMs-t)/1000)));}
  recent.push(t);this.hits.set(key,recent);
  if(this.hits.size>10_000)for(const [k,v] of this.hits)if(!v.some(x=>t-x<this.windowMs))this.hits.delete(k);
 }
}
export type LinkPreviewServiceOptions={
 /** Fetch seams. allowLoopbackForTest inside it is for integration tests only. */
 fetch?:LinkPreviewFetchDeps;
 appleGet?:AppleGet;
 now?:()=>number;
 authorize?:(actor:Actor)=>Promise<void>;
};
const str=(v:unknown,max:number)=>typeof v==='string'&&v.trim()?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max).trim()||null:null;

/** Owner-initiated paste-a-link prefill, image copy and Apple app search. */
export class LinkPreviewService{
 private readonly previews:ActorWindow;private readonly searches:ActorWindow;
 private readonly fetchDeps:LinkPreviewFetchDeps;private readonly appleGet:AppleGet;private readonly authorize:(actor:Actor)=>Promise<void>;
 constructor(private readonly pool:Pool,private readonly media:MediaService,options:LinkPreviewServiceOptions={}){
  const now=options.now??Date.now;
  this.previews=new ActorWindow(30,60_000,now);this.searches=new ActorWindow(20,60_000,now);
  this.fetchDeps={...options.fetch};
  this.appleGet=options.appleGet??(url=>fetchLinkPreviewJson(url,['itunes.apple.com'],this.fetchDeps));
  this.authorize=options.authorize??(actor=>authorizeOperation(this.pool,actor,'entities:resolve',actor?.accountId));
 }
 get loopbackAllowedForTest(){return this.fetchDeps.allowLoopbackForTest===true;}
 async preview(actor:Actor,raw:unknown):Promise<LinkPreview>{
  await this.authorize(actor);
  const parsed=linkPreviewRequestSchema.safeParse(raw);if(!parsed.success)throw new LinkPreviewInputError();
  this.previews.take(actor.accountId);
  const document=await fetchLinkPreviewDocument(parsed.data.url,this.fetchDeps);
  let result=parseLinkPreview(document.url,document.html);
  const endpoint=(result.title===null||result.imageUrl===null)?oembedEndpoint(document.url):null;
  if(endpoint){
   try{
    const o=await fetchLinkPreviewJson(endpoint,['www.youtube.com','vimeo.com'],this.fetchDeps) as Record<string,unknown>;
    const thumb=typeof o?.thumbnail_url==='string'?o.thumbnail_url:null;
    result=linkPreviewSchema.parse({...result,title:result.title??str(o?.title,500),siteName:result.siteName??str(o?.provider_name,200),
     imageUrl:result.imageUrl??(thumb&&linkPreviewImageRequestSchema.safeParse({imageUrl:thumb}).success?thumb:null)});
   }catch{/* oEmbed is best-effort; the page metadata stands. */}
  }
  return result;
 }
 async importImage(actor:Actor,raw:unknown,context:RequestContext):Promise<{id:string}>{
  await this.authorize(actor);
  const parsed=linkPreviewImageRequestSchema.safeParse(raw);if(!parsed.success)throw new LinkPreviewInputError();
  this.previews.take(actor.accountId);
  const image=await fetchLinkPreviewImage(parsed.data.imageUrl,this.fetchDeps);
  // Owned copy: the bytes are stored as the actor's media, never hotlinked.
  const asset=await this.media.createMedia(actor,{purpose:'recommendation',filename:'link-preview',mimeType:image.mimeType,length:image.bytes.length,bytes:image.bytes},context);
  return {id:asset.id};
 }
 async searchApps(actor:Actor,query:{query?:unknown;country?:unknown}):Promise<AppleAppCandidate[]>{
  await this.authorize(actor);
  const term=typeof query?.query==='string'?query.query.trim():'';
  if(term.length<1||term.length>100)throw new LinkPreviewInputError('Invalid app search');
  this.searches.take(actor.accountId);
  try{return await searchAppleApps(term,typeof query.country==='string'?query.country:'US',this.appleGet);}
  catch(error){if(error instanceof AppleSearchInputError)throw new LinkPreviewInputError('Invalid app search');if(error instanceof LinkPreviewBlocked)throw new LinkPreviewUnavailable();throw error;}
 }
}
/** Production factory: no fetch seams, so allowLoopbackForTest stays off. */
export function createLinkPreviewService(pool:Pool,mediaStorage?:ObjectStorage):LinkPreviewService{
 return new LinkPreviewService(pool,new MediaService(pool,mediaStorage));
}
