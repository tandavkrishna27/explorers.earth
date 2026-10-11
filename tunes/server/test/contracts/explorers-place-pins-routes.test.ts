import {describe,it,expect} from 'vitest';
import {registerExplorersPlacePinsRoutes} from '../../routes/explorersPlacePinsRoutes';
import {PlacePinsBoundary} from '../../application/placePinsBoundary';
import {placePinsBodyBytes} from '../../application/contentBodyParser';
import {contentBodyParser} from '../../application/contentBodyParser';
import {Readable} from 'node:stream';
import {hashPlacePinsChunk} from '../../application/placePinsBoundary';
import {Router} from 'express';
const fences={expectedCollectionRevision:1,expectedCategoryContentRevision:'0'};
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',draft='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function harness(boundary:any=new PlacePinsBoundary(async()=>{})){
 const handlers=new Map<string,any>();const router:any={};for(const method of ['get','put','post','delete','all'])router[method]=(path:string,handler:any)=>handlers.set(`${method} ${path}`,handler);
 registerExplorersPlacePinsRoutes(router,{baseURL:'https://owner.test',resolveActor:async()=>({accountId:id,userId:id,role:'owner',credential:{kind:'oauth',grantId:id,scopes:[]}}),boundary});
 return {handlers,async call(method:string,suffix:string,body:any={},changes:any={}){let status=200,payload:any;const headers:Record<string,string>={};const request:any={method:method.toUpperCase(),params:{id,...(suffix.includes(':draftId')?{draftId:draft}:{}),...(suffix.includes(':chunkIndex')?{chunkIndex:'0'}:{})},query:{},body,[placePinsBodyBytes]:method==='get'?0:Buffer.byteLength(JSON.stringify(body)),get:(key:string)=>({'origin':'https://owner.test','Idempotency-Key':'valid-key'} as any)[key],...changes};const response:any={set:(k:string,v:string)=>{headers[k]=v;return response;},status:(v:number)=>{status=v;return response;},json:(v:any)=>{payload=v;return response;}};await handlers.get(`${method} /api/explorers/v1/collections/:id/place-pins${suffix}`)(request,response);return {status,payload,headers};}};
}
describe('Places pin dedicated route registrar',()=>{
 it('rejects implicit HEAD dispatch through actual Express Router before authority',async()=>{
  const router=Router({caseSensitive:true,strict:true});let actorCalls=0,boundaryCalls=0;
  registerExplorersPlacePinsRoutes(router,{baseURL:'https://owner.test',resolveActor:async()=>{actorCalls++;return {accountId:id,userId:id,role:'owner',credential:{kind:'oauth',grantId:id,scopes:[]}};},boundary:{execute:async()=>{boundaryCalls++;return {available:false,state:'unconfigured',reason:'STORAGE_UNAVAILABLE'};}}});
  const req:any={method:'HEAD',url:`/api/explorers/v1/collections/${id}/place-pins/availability`,query:{},body:undefined,[placePinsBodyBytes]:0,get:()=>undefined};
  let status=200,payload:any;const headers:Record<string,string>={};
  await new Promise<void>((resolve,reject)=>{const res:any={set:(key:string,value:string)=>{headers[key]=value;return res;},status:(value:number)=>{status=value;return res;},json:(value:any)=>{payload=value;resolve();return res;}};router(req,res,(error:any)=>reject(error??new Error('Actual HEAD route did not dispatch')));});
  expect(status).toBe(405);expect(payload.error.code).toBe('INVALID_INPUT');expect(headers['Cache-Control']).toBe('no-store');expect(actorCalls).toBe(0);expect(boundaryCalls).toBe(0);
 });
 it('registers six exact methods and all method fallbacks',()=>{const {handlers}=harness();expect([...handlers.keys()]).toEqual(['get /api/explorers/v1/collections/:id/place-pins/availability','all /api/explorers/v1/collections/:id/place-pins/availability','put /api/explorers/v1/collections/:id/place-pins','all /api/explorers/v1/collections/:id/place-pins','post /api/explorers/v1/collections/:id/place-pins/drafts','all /api/explorers/v1/collections/:id/place-pins/drafts','put /api/explorers/v1/collections/:id/place-pins/drafts/:draftId/chunks/:chunkIndex','all /api/explorers/v1/collections/:id/place-pins/drafts/:draftId/chunks/:chunkIndex','post /api/explorers/v1/collections/:id/place-pins/drafts/:draftId/commit','all /api/explorers/v1/collections/:id/place-pins/drafts/:draftId/commit','delete /api/explorers/v1/collections/:id/place-pins/drafts/:draftId','all /api/explorers/v1/collections/:id/place-pins/drafts/:draftId']);});
 it('maps unavailable separately, preserves no-store and request IDs',async()=>{const h=harness();const result=await h.call('put','',{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]});expect(result.status).toBe(503);expect(result.payload.error.code).toBe('UNAVAILABLE');expect(result.payload.error.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(result.headers['Cache-Control']).toBe('no-store');expect((await h.call('all','')).status).toBe(405);});
 it('rejects origin, query, body and parameters before any fake success',async()=>{
  const h=harness();expect((await h.call('put','',{}, {get:()=>undefined})).status).toBe(403);
  expect((await h.call('put','',{}, {query:{foo:'x'}})).status).toBe(422);
  expect((await h.call('get','/availability',{unexpected:true})).status).toBe(422);
  expect((await h.call('put','/drafts/:draftId/chunks/:chunkIndex',{recommendationIds:[],chunkHash:'0'.repeat(64)},{params:{id,draftId:draft,chunkIndex:'01'}})).status).toBe(422);
 });
 it('validates success envelopes with injected resource-free boundary only',async()=>{
  const h=harness({execute:async()=>({collectionId:id,collectionRevision:2,categoryContentRevision:'1',pinCount:0,changed:true})});
  expect((await h.call('put','',{})).payload).toEqual({placePins:{collectionId:id,collectionRevision:2,categoryContentRevision:'1',pinCount:0,changed:true}});
  const bad=harness({execute:async()=>({pretend:true})});expect((await bad.call('put','')).status).toBe(503);
 });
 it('checks read and both write scopes for every operation before unavailable',async()=>{
  const calls:string[]=[];const h=harness(new PlacePinsBoundary(async(_actor,scope)=>{calls.push(scope);}));
  const matrix:[string,string,any][]=[['put','',{...fences,orderedRecommendationIds:[]}],['post','/drafts',fences],['put','/drafts/:draftId/chunks/:chunkIndex',{recommendationIds:[],chunkHash:hashPlacePinsChunk(0,[])}],['post','/drafts/:draftId/commit',{totalCount:0,sequenceHash:'0'.repeat(64)}],['delete','/drafts/:draftId',{}]];
  for(const [method,path,body] of matrix){calls.length=0;expect((await h.call(method,path,body)).status).toBe(503);expect(calls).toEqual(['collections:write','recommendations:write']);}
  calls.length=0;expect((await h.call('get','/availability',undefined,{body:undefined})).payload).toEqual({placePinsAvailability:{available:false,state:'unconfigured',reason:'STORAGE_UNAVAILABLE'}});expect(calls).toEqual(['collections:read']);
 });
 it('rejects missing keys, invalid UUIDs, nonempty aborts and bad chunk digest',async()=>{
  const h=harness();const valid={...fences,orderedRecommendationIds:[]};
  expect((await h.call('put','',valid,{get:(key:string)=>key==='origin'?'https://owner.test':undefined})).status).toBe(422);
  expect((await h.call('put','',valid,{params:{id:'bad'}})).status).toBe(422);
  expect((await h.call('delete','/drafts/:draftId',{foo:true})).status).toBe(422);
  expect((await h.call('put','/drafts/:draftId/chunks/:chunkIndex',{recommendationIds:[],chunkHash:'0'.repeat(64)})).status).toBe(422);
  expect((await h.call('put','',valid,{[placePinsBodyBytes]:65537})).status).toBe(413);
 });
 it('checks every response schema through the real registrar with a fake boundary',async()=>{
  const replace={collectionId:id,collectionRevision:2,categoryContentRevision:'1',pinCount:0,changed:false};
  const matrix:[string,string,any,string][]=[['post','/drafts',{draftId:draft,collectionId:id,...fences,expiresAt:'2026-10-12T00:00:00Z',policyId:'synthetic-contract',policyVersion:1},'placePinsDraft'],['put','/drafts/:draftId/chunks/:chunkIndex',{draftId:draft,chunkIndex:0,chunkHash:'0'.repeat(64),acceptedCount:0,changed:false},'placePinsChunk'],['post','/drafts/:draftId/commit',replace,'placePins'],['delete','/drafts/:draftId',{draftId:draft,changed:false},'placePinsDraftAbort']];
  for(const [method,path,result,envelope] of matrix){const h=harness({execute:async()=>result});expect((await h.call(method,path)).payload).toEqual({[envelope]:result});}
 });
 it('counts actual streamed JSON bytes without Content-Length and preserves old content allowance',async()=>{
  async function parse(path:string,body:string){
   const req:any=Readable.from([Buffer.from(body)]);req.method='PUT';req.path=path;req.headers={'content-type':'application/json','transfer-encoding':'chunked'};
   let status=200,payload:any;const response:any={set:()=>response,status:(s:number)=>{status=s;return response;},json:(value:any)=>{payload=value;done();return response;}};
   let done!:()=>void;await new Promise<void>((resolve,reject)=>{done=resolve;contentBodyParser()(req,response,(error:any)=>error?reject(error):resolve());});
   return {status,payload,bytes:req[placePinsBodyBytes],body:req.body};
  }
  const json='{ "expectedCollectionRevision" : 1, "expectedCategoryContentRevision" : "0", "orderedRecommendationIds" : [] }';
  const accepted=await parse(`/api/explorers/v1/collections/${id}/place-pins`,json);expect(accepted.bytes).toBe(Buffer.byteLength(json));
  const big=JSON.stringify({padding:'x'.repeat(65536)});const denied=await parse(`/api/explorers/v1/collections/${id}/place-pins/drafts/${draft}/chunks/0`,big);expect(denied.status).toBe(413);expect(denied.payload.error.code).toBe('RESOURCE_TOO_LARGE');
  const old=await parse(`/api/explorers/v1/collections/${id}`,big);expect(old.status).toBe(200);expect(old.body.padding).toHaveLength(65536);
 });
});
