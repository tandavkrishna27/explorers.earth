import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import useAuthStore from '../../../../store/store';
import {AppEnrichmentClient} from '../appEnrichmentClient';
import type {RecommendationObservation} from '../../../../lib/explorersApiClient';
vi.mock('../../../../lib/explorersApiClient',async original=>({...await original<typeof import('../../../../lib/explorersApiClient')>(),assertOwnerDetailObservation:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111', account='22222222-2222-4222-8222-222222222222';
const observed={resourceId:id,resourceRevision:7,accountId:account,generation:1,detail:{category:'apps',entityId:id}} as RecommendationObservation;
const binding={accountId:account,recommendationId:id,appEntityId:id,bindingId:id,optIn:true,bindingRevision:3,currentGenerationId:id};
const result={recommendationId:id,bindingId:id,bindingGenerationId:id,optIn:false,bindingRevision:4,recommendationRevision:7,categoryContentRevision:'1',changed:true,receiptId:id};
beforeEach(()=>{useAuthStore.setState({isAuthenticated:true,accountId:account,generation:1});});
afterEach(()=>vi.unstubAllGlobals());
it('retains exact disable body and retry key after a transport failure',async()=>{
 const requests:RequestInit[]=[];vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{requests.push(init);if(requests.length===1)throw new Error('lost response');return new Response(JSON.stringify({binding:result}));});
 const intent=AppEnrichmentClient.prepareDisable(observed,binding);
 await expect(AppEnrichmentClient.execute(intent)).rejects.toThrow();await expect(AppEnrichmentClient.execute(intent)).resolves.toMatchObject({optIn:false});
 expect(JSON.parse(String(requests[0].body))).toEqual({operation:'disableAppEnrichment',expectedRecommendationRevision:7,expectedBindingRevision:3});
 expect(requests[1].body).toBe(requests[0].body);expect(requests[1].headers).toEqual(requests[0].headers);
});
it('rejects late owned read after account generation changes',async()=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>resolve=r));const pending=AppEnrichmentClient.read(observed);
 useAuthStore.setState({generation:2});resolve(new Response(JSON.stringify({binding})));await expect(pending).rejects.toThrow(/changed/);
});
it('keeps authoritative revision conflict and never rebases acceptance',async()=>{
 const requests:RequestInit[]=[];vi.stubGlobal('fetch',async(_url:unknown,init:RequestInit)=>{requests.push(init);return new Response(JSON.stringify({error:{code:'CONFLICT',message:'Revision changed'}}),{status:409});});
 const intent=AppEnrichmentClient.prepareAcceptance(observed,binding,id,['description']);await expect(AppEnrichmentClient.execute(intent)).rejects.toMatchObject({status:409});
 expect(JSON.parse(String(requests[0].body))).toEqual({operation:'acceptAppEnrichment',expectedRecommendationRevision:7,expectedBindingRevision:3,snapshotId:id,selectedFields:['description']});
});
it('rejects a validly shaped response for a different recommendation',async()=>{vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({binding:{...result,recommendationId:account}})));await expect(AppEnrichmentClient.execute(AppEnrichmentClient.prepareDisable(observed,binding))).rejects.toThrow(/Invalid/);});
it('fences a late applied command response after a session change',async()=>{let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>resolve=r));const pending=AppEnrichmentClient.execute(AppEnrichmentClient.prepareDisable(observed,binding));useAuthStore.setState({generation:2});resolve(new Response(JSON.stringify({binding:result})));await expect(pending).rejects.toMatchObject({status:499});});
it('expires the captured session on a definitive malformed 401 response',async()=>{vi.stubGlobal('fetch',async()=>new Response('expired',{status:401}));await expect(AppEnrichmentClient.execute(AppEnrichmentClient.prepareDisable(observed,binding))).rejects.toThrow();expect(useAuthStore.getState().isAuthenticated).toBe(false);expect(useAuthStore.getState().generation).toBeGreaterThan(1);});
it('never expires a newer session on a late 401 response',async()=>{let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',()=>new Promise<Response>(r=>resolve=r));const pending=AppEnrichmentClient.execute(AppEnrichmentClient.prepareDisable(observed,binding));useAuthStore.setState({generation:2});resolve(new Response(JSON.stringify({error:{code:'UNAUTHENTICATED',message:'Expired'}}),{status:401}));await expect(pending).rejects.toThrow();expect(useAuthStore.getState().isAuthenticated).toBe(true);expect(useAuthStore.getState().generation).toBe(2);});
