import {describe,it,expect} from 'vitest';
import {movieMediaSourceSchema,movieMediaSlotSchema,importMovieMediaRequestSchema,movieMediaImportResultSchema,movieProviderMediaSchema} from '../../shared/explorersMovieMediaContract';
const entityId='11111111-1111-4111-8111-111111111111';
const source={entityId,provider:'tmdb',externalKind:'movie',externalId:'1',mappingVersion:1,fetchedAt:0};
const media={id:entityId,url:`/api/explorers/v1/media/${entityId}/content`,mimeType:'image/png',size:8,alternativeText:null,caption:null};
describe('Movies source-bound media wire contracts',()=>{
 it('accepts exact immutable source tuple and rejects unsafe IDs/caller authority',()=>{
  expect(movieMediaSourceSchema.parse(source)).toEqual(source);
  for(const v of [{...source,externalId:'0'},{...source,externalId:'9007199254740992'},{...source,mappingVersion:2},{...source,url:'https://evil.invalid/a'},{...source,fetchedAt:-1}])expect(movieMediaSourceSchema.safeParse(v).success).toBe(false);
 });
 it('retains ordinal identity for repeated person/credit pairs and refuses eleventh cast',()=>{
  const cast={kind:'cast',ordinal:0,personId:1,creditId:'credit'};
  expect(movieMediaSlotSchema.parse(cast)).toEqual(cast);
  expect(movieMediaSlotSchema.parse({...cast,ordinal:9})).toEqual({...cast,ordinal:9});
  for(const v of [{...cast,ordinal:10},{...cast,personId:0},{kind:'poster',ordinal:0},{...cast,creditId:''}])expect(movieMediaSlotSchema.safeParse(v).success).toBe(false);
 });
 it('accepts only revision in import requests and disallows media on unavailable slots',()=>{
  expect(importMovieMediaRequestSchema.parse({expectedRevision:1})).toEqual({expectedRevision:1});
  for(const v of [{expectedRevision:0},{expectedRevision:1,url:'https://image.tmdb.org/t/p/w780/x.jpg'},{expectedRevision:1,source}])expect(importMovieMediaRequestSchema.safeParse(v).success).toBe(false);
  const result={id:entityId,revision:2,source,slots:[{slot:{kind:'poster'},status:'copied',media}]};
  expect(movieMediaImportResultSchema.parse(result)).toEqual(result);
  expect(movieMediaImportResultSchema.safeParse({...result,slots:[{slot:{kind:'poster'},status:'unavailable',media}]}).success).toBe(false);
  expect(movieMediaImportResultSchema.safeParse({...result,slots:[...result.slots,...result.slots]}).success).toBe(false);
 });
 it('caps provider slots independently and rejects copied ID/URL mismatches',()=>{
  const cast=Array.from({length:10},(_,ordinal)=>({slot:{kind:'cast',ordinal,personId:1,creditId:'same-credit'},media:null}));
  const result={source,poster:media,backdrop:null,cast};
  expect(movieProviderMediaSchema.parse(result).cast).toHaveLength(10);
  expect(movieProviderMediaSchema.safeParse({...result,cast:[...cast,{slot:{kind:'cast',ordinal:10,personId:1,creditId:'c'},media:null}]}).success).toBe(false);
  expect(movieProviderMediaSchema.safeParse({...result,poster:{...media,url:'/api/explorers/v1/media/22222222-2222-4222-8222-222222222222/content'}}).success).toBe(false);
  expect(movieProviderMediaSchema.safeParse({...result,cast:[cast[0],cast[0]]}).success).toBe(false);
 });
});

import {MovieImageFetcher,canonicalMovieImageUrl,extractMovieImageSlots} from '../services/movieImageFetch';
import {emptyMovieDetails} from '../../shared/explorersMovieContract';
const png=Buffer.from([137,80,78,71,13,10,26,10]);
const valid='https://image.tmdb.org/t/p/w780/poster.jpg';
describe('canonical Movie image admission and native settlement',()=>{
 it('reconstructs exact fixed host, rendition and safe basename before native admission',()=>{
  expect(canonicalMovieImageUrl(valid,'poster')).toBe(valid);
  for(const url of ['https://image.tmdb.org:443/t/p/w780/poster.jpg','https://evil.invalid/t/p/w780/poster.jpg',valid+'?x=1',valid+'#x','https://image.tmdb.org/t/p/w780/a%2fb.jpg','https://image.tmdb.org/t/p/w780/../poster.jpg','https://image.tmdb.org/t/p/w185/poster.jpg','http://image.tmdb.org/t/p/w780/poster.jpg'])expect(()=>canonicalMovieImageUrl(url,'poster')).toThrow();
 });
 it('takes original first ten cast positions before filtering missing images',()=>{
  const d=emptyMovieDetails();d.posterUrl=valid;
  d.cast=Array.from({length:11},(_,i)=>({personId:1,creditId:'same',name:'Actor',character:'',profileUrl:i===0?null:'https://image.tmdb.org/t/p/w185/actor.jpg',order:i}));
  const slots=extractMovieImageSlots(d);
  expect(slots).toHaveLength(12);expect(slots[2].url).toBeNull();expect(slots[11].slot).toEqual({kind:'cast',ordinal:9,personId:1,creditId:'same'});
 });
 it('rejects the entire mixed/private DNS answer and never connects',async()=>{
  let connections=0;
  const f=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],connect:async()=>{connections++;throw Error();}});
  const work=f.fetchOwned(valid,'poster');await expect(work.completion).rejects.toThrow();await work.settlement;expect(connections).toBe(0);
 });
 it('refuses redirects, MIME/magic mismatch, incorrect lengths and oversized chunks',async()=>{
  for(const response of [{status:302,mimeType:'image/png',body:(async function*(){yield png;})()},{status:200,mimeType:'image/jpeg',body:(async function*(){yield png;})()},{status:200,mimeType:'image/png',length:9,body:(async function*(){yield png;})()},{status:200,mimeType:'image/png',body:(async function*(){yield Buffer.alloc(5242881);})()}]){
   const f=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>response});
   const work=f.fetchOwned(valid,'poster');await expect(work.completion).rejects.toThrow();await work.settlement;
  }
 });
 it('keeps settlement pending while noncooperative DNS or body native work is pending',async()=>{
  let finish!:(v:any)=>void;
  const f=new MovieImageFetcher({mode:'deterministic-fixture',deadlineMs:10,resolve:()=>new Promise(resolve=>{finish=resolve;}),connect:async()=>{throw Error('must not connect after abort');}});
  const work=f.fetchOwned(valid,'poster');let settled=false;work.settlement.then(()=>{settled=true;});
  await expect(work.completion).rejects.toThrow();expect(settled).toBe(false);finish([{address:'8.8.8.8',family:4}]);await work.settlement;expect(settled).toBe(true);
 });
 it('preserves trusted phase rejection and prevents subsequent native admission',async()=>{
  const denied=new Error('actor no longer authorized');let resolutions=0;
  const f=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>{resolutions++;return [{address:'8.8.8.8',family:4}];},connect:async()=>{throw Error('must not connect');}});
  const work=f.fetchOwned(valid,'poster',async()=>{throw denied;});
  await expect(work.completion).rejects.toBe(denied);await work.settlement;expect(resolutions).toBe(0);
 });
 it('returns only validated body bytes and accounts accepted bytes',async()=>{
  const f=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async target=>{expect(target.servername).toBe('image.tmdb.org');expect(target.address).toBe('8.8.8.8');return {status:200,mimeType:'image/png',length:8,body:(async function*(){yield png;})()};}});
  const work=f.fetchOwned(valid,'poster');await expect(work.completion).resolves.toEqual({bytes:png,mimeType:'image/png'});await work.settlement;expect(work.acceptedBytes()).toBe(8);
 });
});

it('retains native disposal ownership after rejected headers and body admission',async()=>{
 for(const mode of ['headers','body'] as const){
  let close!:()=>void,discarded=false,settled=false;const disposal=new Promise<void>(r=>{close=r;});
  const response={status:mode==='headers'?302:200,mimeType:'image/png',body:(async function*(){yield png;})(),settlement:disposal,discard:()=>{discarded=true;}};
  const f=new MovieImageFetcher({mode:'deterministic-fixture',resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>response});
  const denied=new Error('source no longer current');const work=f.fetchOwned(valid,'poster',async phase=>{if(mode==='body'&&phase==='body')throw denied;});
  work.settlement.then(()=>{settled=true;});await expect(work.completion).rejects.toThrow();await new Promise(r=>setTimeout(r,10));
  expect(discarded).toBe(true);expect(settled).toBe(false);close();await work.settlement;expect(settled).toBe(true);
 }
});

it('holds rejected-body iterator cancellation through repeated aborts until disposal settles',async()=>{
 let finish!:()=>void,returns=0,settled=false;const gate=new Promise<void>(r=>{finish=r;});
 const body={ [Symbol.asyncIterator]:()=>({next:async()=>({done:false as const,value:Buffer.alloc(5242881)}),return:async()=>{returns++;await gate;return {done:true as const,value:undefined};}})};
 const f=new MovieImageFetcher({mode:'deterministic-fixture',deadlineMs:10,resolve:async()=>[{address:'8.8.8.8',family:4}],connect:async()=>({status:200,mimeType:'image/png',body})});
 const work=f.fetchOwned(valid,'poster');work.settlement.then(()=>{settled=true;});await expect(work.completion).rejects.toThrow();work.abort();work.abort();
 expect(settled).toBe(false);finish();await work.settlement;expect(settled).toBe(true);expect(returns).toBeGreaterThanOrEqual(1);expect(work.acceptedBytes()).toBe(0);
});
