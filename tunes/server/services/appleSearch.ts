import {fetchLinkPreviewJson,type LinkPreviewFetchDeps} from './linkPreviewFetch';

export type AppleEntity='software'|'macSoftware';
export type AppleAppCandidate={title:string;developer:string|null;appUrl:string;iconUrl:string|null;priceTier:'Free'|'Paid';platforms:('iOS'|'macOS')[];genres:string[];screenshotUrls:string[]};
export type AppleGet=(url:string)=>Promise<unknown>;
export class AppleSearchInputError extends Error{constructor(){super('Invalid app search');}}

const APPLE_HOST='itunes.apple.com';
const country=(value:unknown)=>typeof value==='string'&&/^[A-Z]{2}$/.test(value)?value:'US';
export function appleSearchUrl(term:string,countryCode:string,entity:AppleEntity):string{
 const q=new URLSearchParams({term,country:country(countryCode),media:'software',entity,limit:'10'});
 return `https://${APPLE_HOST}/search?${q.toString()}`;
}
/** Production getter: the same bounded, re-guarded fetch as link previews, pinned to itunes.apple.com only. */
export const fetchJsonPinned=(deps:LinkPreviewFetchDeps={}):AppleGet=>url=>fetchLinkPreviewJson(url,[APPLE_HOST],deps);

const appleUrl=(v:unknown,hosts:RegExp)=>{if(typeof v!=='string')return null;try{const u=new URL(v);return u.protocol==='https:'&&hosts.test(u.hostname)&&!u.username&&!u.password&&!u.port&&v.length<=2048?u.href:null;}catch{return null;}};
const APP_HOSTS=/^(apps|itunes)\.apple\.com$/,ART_HOSTS=/^is\d+-ssl\.mzstatic\.com$/;
const str=(v:unknown,max:number)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;

function map(hit:any):AppleAppCandidate|null{
 if(!hit||typeof hit!=='object')return null;
 const title=str(hit.trackName,500),appUrl=appleUrl(hit.trackViewUrl,APP_HOSTS);
 if(!title||!appUrl)return null;
 return {title,developer:str(hit.sellerName,200)??str(hit.artistName,200),appUrl,iconUrl:appleUrl(hit.artworkUrl512,ART_HOSTS),
  priceTier:hit.price===0?'Free':'Paid',platforms:hit.kind==='mac-software'?['macOS']:['iOS'],
  genres:(Array.isArray(hit.genres)?hit.genres:[]).map((g:unknown)=>str(g,100)).filter(Boolean).slice(0,10),
  screenshotUrls:(Array.isArray(hit.screenshotUrls)?hit.screenshotUrls:[]).map((u:unknown)=>appleUrl(u,ART_HOSTS)).filter(Boolean).slice(0,10)};
}
/** Keyword search over iOS then macOS software (two sequential calls), deduped by store URL, at most 20 results. */
export async function searchAppleApps(term:string,countryCode:string,get:AppleGet=fetchJsonPinned()):Promise<AppleAppCandidate[]>{
 const t=typeof term==='string'?term.trim():'';
 if(t.length<1||t.length>100)throw new AppleSearchInputError();
 const out=new Map<string,AppleAppCandidate>();
 for(const entity of ['software','macSoftware'] as const){
  const body=await get(appleSearchUrl(t,countryCode,entity)) as {results?:unknown};
  for(const hit of Array.isArray(body?.results)?body.results:[]){const c=map(hit);if(c&&!out.has(c.appUrl))out.set(c.appUrl,c);}
 }
 return [...out.values()].slice(0,20);
}
