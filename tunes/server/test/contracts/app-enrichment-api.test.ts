import {describe,it,expect,vi} from 'vitest';
import {AppEnrichmentService} from '../../application/appEnrichment';
import {registerExplorersAppEnrichmentRoutes} from '../../routes/explorersAppEnrichmentRoutes';
const id='10000000-0000-4000-8000-000000000001';
const actor:any={accountId:id,userId:id,role:'owner',credential:{kind:'oauth',grantId:id,scopes:['recommendations:write','recommendations:read']}};
const command={operation:'disableAppEnrichment',expectedRecommendationRevision:1,expectedBindingRevision:1};
function fixture(){const repository:any={execute:vi.fn(async()=>({recommendationId:id,bindingId:id,bindingGenerationId:id,optIn:false,bindingRevision:2,recommendationRevision:1,categoryContentRevision:'0',changed:true,receiptId:id})),readBinding:vi.fn(async()=>null),readSuggestions:vi.fn(async()=>[])};const pool:any={query:vi.fn(async(sql:string)=>({rows:sql.includes('account_memberships')?[{status:'active',role:'owner',session_version:'1',blocked_at:null}]:[{category:'apps',kind:'app',origin:'manual'}]}))};return {repository,pool,service:new AppEnrichmentService(pool,[],repository)};}
describe('Apps A1 application',()=>{
 it('passes canonical command path actor and key',async()=>{const f=fixture();await f.service.execute(actor,id,command,{requestId:'r',idempotencyKey:'valid-key'});expect(f.repository.execute).toHaveBeenCalledWith(id,id,command,id,{idempotencyKey:'valid-key'});});
 it.each([{...command,accountId:id},{...command,expectedBindingRevision:null},{...command,seedSnapshot:{}}])('rejects invalid command %#',async input=>{const f=fixture();await expect(f.service.execute(actor,id,input,{requestId:'r',idempotencyKey:'valid-key'})).rejects.toMatchObject({status:422});expect(f.repository.execute).not.toHaveBeenCalled();});
 it('checks current scopes before replay',async()=>{const f=fixture();await expect(f.service.execute({...actor,credential:{...actor.credential,scopes:[]}},id,command,{requestId:'r',idempotencyKey:'valid-key'})).rejects.toMatchObject({status:403});expect(f.repository.execute).not.toHaveBeenCalled();});
 it('rejects malformed path and absent key',async()=>{const f=fixture();for(const [path,context] of [['bad',{idempotencyKey:'valid-key'}],[id,{}]] as const)await expect(f.service.execute(actor,path,command,{requestId:'r',...context})).rejects.toMatchObject({status:422});});
 it('returns nondisclosing missing reads',async()=>{const f=fixture();f.pool.query.mockImplementation(async(sql:string)=>({rows:sql.includes('account_memberships')?[{status:'active',role:'owner',session_version:'1',blocked_at:null}]:[]}));await expect(f.service.readBinding(actor,id)).rejects.toMatchObject({status:404});await expect(f.service.readSuggestions(actor,id)).rejects.toMatchObject({status:404});});
 it('maps deferred database errors',async()=>{const f=fixture();f.repository.execute.mockRejectedValue({code:'23514'});await expect(f.service.execute(actor,id,command,{requestId:'r',idempotencyKey:'valid-key'})).rejects.toMatchObject({status:422});});
});
const base='/api/explorers/v1/recommendations/:id/app-enrichment';
function routes(){const handlers=new Map<string,any>();const router:any=Object.fromEntries(['get','put','delete','post','all'].map(method=>[method,(path:string,handler:any)=>handlers.set(method+' '+path,handler)]));const service:any={execute:vi.fn(async()=>({ok:true})),readBinding:vi.fn(),readSuggestions:vi.fn()};registerExplorersAppEnrichmentRoutes(router,{baseURL:'https://example.test',resolveActor:async()=>actor,service});const response:any={set:vi.fn().mockReturnThis(),status:vi.fn().mockReturnThis(),json:vi.fn().mockReturnThis()};return {handlers,service,response};}
describe('Apps A1 registered HTTP handlers',()=>{
 it('registers binding suggestions acceptances',()=>{expect([...routes().handlers.keys()]).toHaveLength(8);});
 it('passes context and envelope',async()=>{const f=routes();await f.handlers.get('delete '+base+'/binding')({params:{id},query:{},body:command,get:(n:string)=>n==='origin'?'https://example.test':'valid-key'},f.response);expect(f.service.execute.mock.calls[0][3]).toMatchObject({idempotencyKey:'valid-key',requestId:expect.any(String)});expect(f.response.json).toHaveBeenCalledWith({binding:{ok:true}});});
 it.each(['origin','query','operation'])('rejects invalid %s',async kind=>{const f=routes();await f.handlers.get('delete '+base+'/binding')({params:{id},query:kind==='query'?{bad:1}:{},body:kind==='operation'?{...command,operation:'acceptAppEnrichment'}:command,get:(n:string)=>n==='origin'?(kind==='origin'?'https://foreign.test':'https://example.test'):'valid-key'},f.response);expect(f.response.status).toHaveBeenCalledWith(kind==='origin'?403:422);expect(f.service.execute).not.toHaveBeenCalled();expect(f.response.json.mock.calls[0][0].error.requestId).toEqual(expect.any(String));});
});

describe('Apps A1 additional authority and response contracts',()=>{
 it('rejects current inactive account before replay storage',async()=>{const f=fixture();f.pool.query.mockResolvedValue({rows:[{status:'suspended',role:'owner',session_version:'1',blocked_at:null}]});await expect(f.service.execute(actor,id,command,{requestId:'r',idempotencyKey:'valid-key'})).rejects.toMatchObject({status:403});expect(f.repository.execute).not.toHaveBeenCalled();});
 it('requires read scope independently from write',async()=>{const f=fixture();await expect(f.service.readBinding({...actor,credential:{...actor.credential,scopes:['recommendations:write']}},id)).rejects.toMatchObject({status:403});expect(f.repository.readBinding).not.toHaveBeenCalled();});
 it('rejects owned wrong category with 422',async()=>{const f=fixture();f.pool.query.mockImplementation(async(sql:string)=>({rows:sql.includes('account_memberships')?[{status:'active',role:'owner',session_version:'1',blocked_at:null}]:[{category:'books',kind:'book',origin:'manual'}]}));await expect(f.service.readSuggestions(actor,id)).rejects.toMatchObject({status:422});});
 it('permits owned absent binding and empty suggestions',async()=>{const f=fixture();expect(await f.service.readBinding(actor,id)).toBeNull();expect(await f.service.readSuggestions(actor,id)).toEqual([]);});
 it('maps uniqueness to conflict',async()=>{const f=fixture();f.repository.execute.mockRejectedValue({code:'23505'});await expect(f.service.execute(actor,id,command,{requestId:'r',idempotencyKey:'valid-key'})).rejects.toMatchObject({status:409});});
 it.each([404,409,422])('emits typed %s error envelope',async status=>{const f=routes();const {RecommendationFailure}=await import('../../repositories/explorersRecommendationRepository');f.service.execute.mockRejectedValue(new RecommendationFailure(status as 404|409|422,'Unavailable'));await f.handlers.get('delete '+base+'/binding')({params:{id},query:{},body:command,get:(n:string)=>n==='origin'?'https://example.test':'valid-key'},f.response);expect(f.response.status).toHaveBeenCalledWith(status);expect(f.response.json).toHaveBeenCalledWith({error:{code:status===404?'NOT_FOUND':status===409?'CONFLICT':'INVALID_INPUT',message:'Unavailable',requestId:expect.any(String)}});});
 it('returns sanitized unexpected failure',async()=>{const f=routes();f.service.execute.mockRejectedValue(new Error('secret database internals'));await f.handlers.get('delete '+base+'/binding')({params:{id},query:{},body:command,get:(n:string)=>n==='origin'?'https://example.test':'valid-key'},f.response);expect(f.response.status).toHaveBeenCalledWith(500);expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('secret');});
 it('rejects read query parameters and unsupported methods',async()=>{const f=routes();await f.handlers.get('get '+base+'/suggestions')({params:{id},query:{snapshotId:id}},f.response);expect(f.response.status).toHaveBeenCalledWith(422);expect(f.service.readSuggestions).not.toHaveBeenCalled();await f.handlers.get('all '+base+'/suggestions')({},f.response);expect(f.response.status).toHaveBeenCalledWith(405);});
});

import {resolve} from 'node:path';
import {inventoryRuntimeSurfaces} from '../../../scripts/inventory-runtime-surfaces';
it('source scanner inventories five Apps owner handlers and three method guards',()=>{
 const found=inventoryRuntimeSurfaces(resolve(import.meta.dirname,'../../../..')).routes.filter(route=>route.source==='tunes/server/routes/explorersAppEnrichmentRoutes.ts').map(({method,path})=>({method,path}));
 expect(found).toHaveLength(8);
 expect(found).toEqual(expect.arrayContaining([
  {method:'PUT',path:base+'/binding'},{method:'DELETE',path:base+'/binding'},{method:'GET',path:base+'/binding'},
  {method:'POST',path:base+'/acceptances'},{method:'GET',path:base+'/suggestions'},
  {method:'ALL',path:base+'/binding'},{method:'ALL',path:base+'/acceptances'},{method:'ALL',path:base+'/suggestions'}
 ]));
});

import express from 'express';
import {EventEmitter} from 'node:events';
import {createCanonicalHandlerCustody} from '../../auth/canonicalHandlerCustody';
import {setupExplorersAppEnrichmentRoutes} from '../../routes/explorersAppEnrichmentRoutes';
import * as principal from '../../middleware/explorersPrincipal';
it('Apps setup uses custody factory and retains deferred async handler after response finish',async()=>{
 const app=express(),instrument=createCanonicalHandlerCustody(app);let release!:()=>void;
 const tail=new Promise<void>(resolve=>{release=resolve;});
 const actorSpy=vi.spyOn(principal,'requireActor').mockImplementation(async()=>{await tail;return actor;});
 const executeSpy=vi.spyOn(AppEnrichmentService.prototype,'execute').mockResolvedValue({} as any);
 try{
  setupExplorersAppEnrichmentRoutes(instrument.registration,{} as any,{} as any,{baseURL:'https://example.test'} as any,[],instrument.routerFactory);
  instrument.completeRegistration();
  const mounted=(app as any).router.stack.find((layer:any)=>layer.name==='router');
  const handler=mounted.handle.stack.find((layer:any)=>layer.route?.methods.delete).route.stack[0].handle;
  const req:any=Object.assign(new EventEmitter(),{complete:true,readableEnded:true,aborted:false,method:'DELETE',params:{id},query:{},body:command,get:(name:string)=>name==='origin'?'https://example.test':'valid-key'});
  const res:any=Object.assign(new EventEmitter(),{set:()=>res,status:()=>res,json:()=>{res.emit('finish');return res;}});
  const work=handler(req,res,()=>undefined);res.emit('finish');
  expect(instrument.custody.snapshot()).toMatchObject({frames:1,requests:1,uncertain:false});
  release();await work;
  expect((await instrument.custody.sealAndDrain(10)).status).toBe('settled');
 }finally{release();actorSpy.mockRestore();executeSpy.mockRestore();}
});
