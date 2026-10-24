import {nearbyPlaceSchema,placesNearbyResponseSchema,type NearbyPlace,type PlacesNearbyResponse} from '../../shared/explorersPlacesNearbyContract';

// WP6 (ruling R11): the server owns the nearby lookup so the Google key never reaches the
// browser. Google Places (New) basic tier when a key is configured; OpenStreetMap
// Nominatim otherwise or when Google fails; 'none' when both fail.
export const GOOGLE_NEARBY_URL='https://places.googleapis.com/v1/places:searchNearby';
export const GOOGLE_NEARBY_FIELD_MASK='places.id,places.displayName,places.location,places.shortFormattedAddress';
export const NOMINATIM_REVERSE_URL='https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_USER_AGENT='explorers.earth/1.0 (+https://explorers.earth)';
const TIMEOUT_MS=5000;
const MAX_RESPONSE_BYTES=256*1024;
const DAY_MS=24*3600_000;

export type FetchLike=(url:string,init:RequestInit)=>Promise<Response>;
export class PlacesNearbyFailure extends Error{
 constructor(readonly status:429,readonly code:'RATE_LIMITED',readonly retryAfterSeconds:number){super('Too many nearby lookups; try again shortly');}
}

/** ~110m cell, the same rounding the client cache uses (nearbyCache.ts). */
export const nearbyCellKey=(lat:number,lng:number)=>`${lat.toFixed(3)},${lng.toFixed(3)}`;

async function readBounded(response:Response):Promise<unknown>{
 if(!response.ok)throw new Error(`provider status ${response.status}`);
 const declared=Number(response.headers.get('content-length')??0);
 if(declared>MAX_RESPONSE_BYTES)throw new Error('provider response too large');
 const text=await response.text();
 if(text.length>MAX_RESPONSE_BYTES)throw new Error('provider response too large');
 return JSON.parse(text);
}
const valid=(candidate:unknown):candidate is NearbyPlace=>nearbyPlaceSchema.safeParse(candidate).success;
const clip=(value:unknown,max:number)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;

export async function googleNearby(fetch:FetchLike,apiKey:string,lat:number,lng:number):Promise<NearbyPlace[]>{
 const response=await fetch(GOOGLE_NEARBY_URL,{method:'POST',signal:AbortSignal.timeout(TIMEOUT_MS),
  headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':GOOGLE_NEARBY_FIELD_MASK},
  body:JSON.stringify({maxResultCount:8,rankPreference:'DISTANCE',locationRestriction:{circle:{center:{latitude:lat,longitude:lng},radius:250}}})});
 const body=await readBounded(response) as {places?:unknown};
 const places=Array.isArray(body?.places)?body.places as Array<Record<string,any>>:[];
 return places.map(p=>({id:clip(p?.id,300),title:clip(p?.displayName?.text,500),subtitle:clip(p?.shortFormattedAddress,1000),
  lat:p?.location?.latitude,lng:p?.location?.longitude})).filter(valid).slice(0,8);
}

export async function osmNearby(fetch:FetchLike,lat:number,lng:number):Promise<NearbyPlace[]>{
 const url=`${NOMINATIM_REVERSE_URL}?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`;
 const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(TIMEOUT_MS),headers:{'User-Agent':NOMINATIM_USER_AGENT,Accept:'application/json'}});
 const body=await readBounded(response) as Record<string,any>;
 if(!body||body.error||!/^(node|way|relation)$/.test(String(body.osm_type))||!Number.isSafeInteger(Number(body.osm_id)))return [];
 const subtitle=clip(body.display_name,1000);
 const place={id:`osm:${body.osm_type}:${Number(body.osm_id)}`,title:clip(body.name,500)??clip(subtitle?.split(',')[0],500),subtitle,lat:Number(body.lat),lng:Number(body.lon)};
 return valid(place)?[place]:[];
}

export interface PlacesNearbyOptions{googleApiKey?:string;fetch?:FetchLike;now?:()=>number;cacheEntries?:number;cacheTtlMs?:number;rateLimit?:number}
export class PlacesNearbyService{
 private readonly cache=new Map<string,{at:number;value:PlacesNearbyResponse}>();
 private readonly rates=new Map<string,{at:number;count:number}>();
 private readonly fetch:FetchLike;private readonly now:()=>number;
 constructor(private readonly options:PlacesNearbyOptions={}){
  this.fetch=options.fetch??((url,init)=>globalThis.fetch(url,init));this.now=options.now??Date.now;
 }
 private rate(account:string){
  const now=this.now();const limit=this.options.rateLimit??30;
  for(const [key,r] of Array.from(this.rates))if(now-r.at>=60_000)this.rates.delete(key);
  const r=this.rates.get(account);
  if(r&&r.count>=limit||!r&&this.rates.size>=10_000)throw new PlacesNearbyFailure(429,'RATE_LIMITED',Math.max(1,Math.ceil(((r?.at??now)+60_000-now)/1000)));
  this.rates.set(account,{at:r?.at??now,count:(r?.count??0)+1});
 }
 async nearby(account:string,{lat,lng}:{lat:number;lng:number}):Promise<PlacesNearbyResponse>{
  this.rate(account);
  const key=nearbyCellKey(lat,lng);const now=this.now();
  const hit=this.cache.get(key);
  if(hit&&now-hit.at<(this.options.cacheTtlMs??DAY_MS)){this.cache.delete(key);this.cache.set(key,hit);return hit.value;}
  if(hit)this.cache.delete(key);
  const value=await this.lookup(lat,lng);
  if(value.source!=='none'){
   this.cache.set(key,{at:now,value});
   const max=this.options.cacheEntries??500;
   while(this.cache.size>max)this.cache.delete(this.cache.keys().next().value as string);
  }
  return value;
 }
 private async lookup(lat:number,lng:number):Promise<PlacesNearbyResponse>{
  const key=this.options.googleApiKey?.trim();
  if(key){try{return placesNearbyResponseSchema.parse({source:'google',places:await googleNearby(this.fetch,key,lat,lng)});}catch{/* fall through to OSM */}}
  try{return placesNearbyResponseSchema.parse({source:'osm',places:await osmNearby(this.fetch,lat,lng)});}catch{return {source:'none',places:[]};}
 }
}
