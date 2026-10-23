import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import * as api from '../explorersApiClient';
import type {CollectionObservation} from '../explorersApiClient';
import useAuthStore from '../../store/store';
import {ProductsClient} from '../../features/Products/api/productsClient';
import {PeopleClient} from '../../features/People/api/peopleClient';
import type {CreateCollectionInput} from '../../../../tunes/shared/explorersContract';

const account='00000000-0000-4000-8000-000000000101',parentId='00000000-0000-4000-8000-000000000102',childId='00000000-0000-4000-8000-000000000103',otherId='00000000-0000-4000-8000-000000000104';
const input=(category='products')=>({category,title:'Child',slug:'child',visibility:'private',publicationState:'draft'} as CreateCollectionInput);
const core=(category='products')=>({id:childId,accountId:account,category,title:'Child',slug:'child',visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,isSample:false});
const receipt=(category='products')=>({collection:{...core(category),parentLocation:{id:parentId,revision:5}}});
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
function signIn(id=account){const generation=useAuthStore.getState().beginVerification();useAuthStore.getState().acceptVerified(generation,{id,userId:otherId,username:'owner',email:'owner@example.invalid',onboardingStatus:'complete',revision:1});}
type Failure={kind:string;status?:number;code?:string};
function classification(error:unknown):Failure|undefined {const classify=(api as unknown as {getGuardedParentCreateFailure?:(error:unknown)=>Failure|undefined}).getGuardedParentCreateFailure;const metadata=classify?.(error);if(metadata)expect.soft(Object.isFrozen(metadata)).toBe(true);return metadata;}
// Cast only the proposed additive call surface. Authority always comes from the real reader.
const create=api.explorersApiClient.createMyCollection as (input:CreateCollectionInput,key:string,signal?:AbortSignal,parent?:CollectionObservation)=>Promise<ReturnType<typeof core>&{parentLocation?:{id:string;revision:number}}>;
async function failure(work:Promise<unknown>,status:number,kind?:string){const outcome=await work.then(value=>({value}),error=>({error}));expect(outcome).toHaveProperty('error');const error=(outcome as {error:unknown}).error;expect(error).toMatchObject({status});if(kind)expect.soft(classification(error)).toMatchObject({kind});return error;}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
const posts:RequestInit[]=[];let reads=0;
let respond:(options:RequestInit)=>Response|Promise<Response>;
function transport(category='places',recommendation=false){vi.stubGlobal('fetch',async(_url:string,options:RequestInit={})=>{if(options.method==='POST'){posts.push(options);return respond(options);}reads++;return reply(recommendation?{recommendation:{id:parentId,accountId:account,category:'people',entityId:otherId,userRating:null,publicationState:'draft',revision:4,mediaIds:[],archived:false,pin:null,categoryRevision:'9',note:null,entity:{id:otherId,kind:'person',title:'Person'},displayOverrides:{},displayTitle:'Person',
 // The owner detail projection always hydrates the people sector for a people row
 // (tunes/server/application/ownerContent.ts:251 -> readTaxonomyAssignment, which
 // returns {peopleSector:...} unconditionally), so the fixture must carry it.
 peopleSector:{catalogState:'UNCONFIGURED',catalogVersion:0,defaultLocale:null,sector:null,selectionUnavailable:false}}}:{collection:{...core(category),id:parentId,title:'Parent',slug:'parent',revision:4,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',...(category==='places'?{linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}:category==='people'||category==='products'?{locationLink:null}:{})}});});}
async function observe(category='places'){transport(category);return api.explorersApiClient.getMyEditableCollection(parentId);}
function wire(index=0){return JSON.parse(posts[index].body as string);}
function authority(parent:CollectionObservation){expect(()=>api.assertOwnerDetailObservation(parent,'collection')).not.toThrow();}
function consumed(parent:CollectionObservation){expect(()=>api.assertOwnerDetailObservation(parent,'collection')).toThrow();}
function exactReplay(){expect(posts).toHaveLength(2);expect(posts[1].body).toBe(posts[0].body);expect(new Headers(posts[1].headers).get('Idempotency-Key')).toBe(new Headers(posts[0].headers).get('Idempotency-Key'));expect(reads).toBe(1);expect(wire()).toMatchObject({parentLocationCollectionId:parentId,parentExpectedRevision:4});}
beforeEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();signIn();posts.length=0;reads=0;respond=()=>reply(receipt());});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();useAuthStore.getState().logout();});

it('keeps ordinary three-argument create compatible and rejects an unexpected parent receipt',async()=>{
 for(const category of ['products','people','books']){transport();respond=()=>reply({collection:core(category)});const result=await create(input(category),'ordinary',undefined);expect(result).toEqual(core(category));expect(wire(posts.length-1)).toEqual({...input(category),description:null,heading:null,coverMediaId:null});}
 respond=()=>reply(receipt());const error=await failure(create(input(),'ordinary-parent',undefined),503);expect.soft(classification(error)).toBeUndefined();expect.soft(classification(new api.ExplorersApiError(409,'CONFLICT','unrelated'))).toBeUndefined();
});
it('derives the guarded parent pair from an issued Places observation for Products and People',async()=>{
 for(const category of ['products','people']){const parent=await observe();respond=()=>reply(receipt(category));const result=await create(input(category),'guarded-key',undefined,parent);expect(wire(posts.length-1)).toEqual({...input(category),description:null,heading:null,coverMediaId:null,parentLocationCollectionId:parentId,parentExpectedRevision:4});expect(result).toEqual(receipt(category).collection);expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.parentLocation)).toBe(true);consumed(parent);}
});
it('forwards actual Places authority through both category create facades',async()=>{
 for(const [client,category] of [[ProductsClient,'products'],[PeopleClient,'people']] as const){const parent=await observe();respond=()=>reply(receipt(category));const call=client.createCollection as (input:{title:string;slug:string},key:string,signal?:AbortSignal,parent?:CollectionObservation)=>Promise<unknown>;expect(await call({title:'Child',slug:'child'},'facade-key',undefined,parent)).toEqual(receipt(category).collection);expect(wire(posts.length-1)).toEqual({...input(category),description:null,heading:null,coverMediaId:null,parentLocationCollectionId:parentId,parentExpectedRevision:4});consumed(parent);}
});
it('rejects raw parent fields and ambiguous caller revisions before posting',async()=>{
 for(const raw of [{parentLocationCollectionId:parentId},{parentExpectedRevision:4},{parentLocationCollectionId:parentId,parentExpectedRevision:4}]){transport();await failure(create({...input(),...raw},'raw-command'),422);expect(posts).toHaveLength(0);}
 for(const raw of [{parentExpectedRevision:4},{parentExpectedRevision:7},{parentLocationCollectionId:otherId}]){const parent=await observe();await failure(create({...input(),...raw},'raw-command',undefined,parent),422,'local-rejection');authority(parent);expect(posts).toHaveLength(0);}
 const parent=await observe();await create({...input(),parentLocationCollectionId:parentId},'matching',undefined,parent);expect(wire()).toMatchObject({parentExpectedRevision:4});
});
it('rejects fabricated cloned and wrong-kind parent observations before posting',async()=>{
 const parent=await observe();for(const invalid of [{kind:'collection',resourceId:parentId,resourceRevision:4},{...parent},structuredClone(parent),null,false,0,'']){await failure(create(input(),'fake-key',undefined,invalid as CollectionObservation),409,'local-rejection');expect(posts).toHaveLength(0);}authority(parent);
 transport('people',true);const recommendation=await api.explorersApiClient.getMyEditableRecommendation(parentId);await failure(create(input(),'wrong-kind',undefined,recommendation as unknown as CollectionObservation),409,'local-rejection');expect(posts).toHaveLength(0);
});
it('rejects wrong-category expired and obsolete owner authority before posting',async()=>{
 const wrong=await observe('books');await failure(create(input(),'category',undefined,wrong),422,'local-rejection');expect(posts).toHaveLength(0);
 const aged=await observe();const clock=vi.spyOn(Date,'now').mockReturnValue(aged.observedAt+600000);await failure(create(input(),'expired-key',undefined,aged),409,'local-rejection');clock.mockRestore();expect(posts).toHaveLength(0);
 for(const id of [account,otherId]){const parent=await observe();signIn(id);await failure(create(input(),'obsolete',undefined,parent),409,'custody-lost');expect(posts).toHaveLength(0);signIn();}
 const parent=await observe();await failure(create(input('books'),'unsupported',undefined,parent),422,'local-rejection');expect(posts).toHaveLength(0);
});
it('rejects malformed linked success envelopes while retaining replay authority',async()=>{
 const cases=[{...receipt(),extra:true},{},{collection:core()},{collection:{...receipt().collection,id:'broken'}},{collection:{...receipt().collection,parentLocation:{id:parentId,revision:5,extra:true}}},{collection:{...receipt().collection,extra:true}},{collection:{...receipt().collection,parentLocation:{id:parentId,revision:'5'}}}];
 for(const invalid of cases){posts.length=0;reads=0;const parent=await observe();respond=()=>reply(invalid);await failure(create(input(),'malformed',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'malformed',undefined,parent);exactReplay();consumed(parent);}
});
it('rejects wrong parent identity or revision without consuming replay authority',async()=>{
 for(const pair of [{id:otherId,revision:5},{id:parentId,revision:4},{id:parentId,revision:6}]){posts.length=0;reads=0;const parent=await observe();respond=()=>reply({collection:{...core(),parentLocation:pair}});await failure(create(input(),'parent-mismatch',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'parent-mismatch',undefined,parent);exactReplay();}
});
it('rejects wrong child account category revision and parent-equal identity',async()=>{
 for(const patch of [{accountId:otherId},{category:'people'},{revision:2},{id:parentId}]){const parent=await observe();respond=()=>reply({collection:{...receipt().collection,...patch}});await failure(create(input(),'child-mismatch',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'child-mismatch',undefined,parent);}
 const parent=await observe();respond=()=>reply({collection:{...receipt().collection,id:otherId}});expect(await create(input(),'distinct',undefined,parent)).toMatchObject({id:otherId});
});
it('replays the original key and parent pair after a network acknowledgement failure',async()=>{
 const parent=await observe();respond=()=>{throw Error('acknowledgement lost');};await failure(create(input(),'network-replay',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'network-replay',undefined,parent);exactReplay();consumed(parent);
});
it('replays the original key and parent pair after invalid JSON or malformed successful acknowledgement',async()=>{
 for(const invalid of [()=>new Response('{',{status:200}),()=>reply({collection:core()})]){posts.length=0;reads=0;const parent=await observe();respond=invalid;await failure(create(input(),'ack-replay',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'ack-replay',undefined,parent);exactReplay();consumed(parent);}
});
it('consumes parent authority after definitive server refusals but preserves uncertain failures',async()=>{
 for(const status of [401,403,404,409,422]){signIn();posts.length=0;const parent=await observe();respond=()=>reply({error:{code:status===401?'UNAUTHENTICATED':status===422?'INVALID_INPUT':'CONFLICT',message:'refused',requestId:otherId}},status);const error=await failure(create(input(),'refusal-key',undefined,parent),status===401?409:status,status===401?'custody-lost':'server-refusal');if(status!==401)expect.soft(classification(error)).toEqual({kind:'server-refusal',status,code:status===422?'INVALID_INPUT':'CONFLICT'});consumed(parent);if(status===401)signIn();const local=await failure(create(input(),'refusal-key',undefined,parent),409,status===401?'custody-lost':'local-rejection');expect(local).toMatchObject({code:'CONFLICT'});expect(posts).toHaveLength(1);}
 signIn();for(const invalid of [reply({error:{code:'UNAVAILABLE',message:'outage',requestId:otherId}},503),reply({error:{code:'CONFLICT',message:'unvalidated'}},409)]){posts.length=0;const parent=await observe();respond=()=>invalid;await failure(create(input(),'uncertain',undefined,parent),503,'uncertain');authority(parent);respond=()=>reply(receipt());await create(input(),'uncertain',undefined,parent);}
 for(const [bad,key] of [[{...input(),title:''},'local-key'],[{...input(),unrelated:true},'local-key'],[input(),'']] as const){posts.length=0;const parent=await observe();const error=await failure(create(bad,key,undefined,parent),422,'local-rejection');expect.soft(classification(error)).toEqual({kind:'local-rejection'});authority(parent);expect(posts).toHaveLength(0);respond=()=>reply(receipt());await create(input(),'valid-key',undefined,parent);}
 posts.length=0;reads=0;const parent=await observe();respond=()=>{throw Error('lost');};await failure(create(input(),'expired-replay',undefined,parent),503,'uncertain');const clock=vi.spyOn(Date,'now').mockReturnValue(parent.observedAt+600000);await failure(create(input(),'expired-replay',undefined,parent),409,'local-rejection');expect(posts).toHaveLength(1);expect(reads).toBe(1);expect(new Headers(posts[0].headers).get('Idempotency-Key')).toBe('expired-replay');clock.mockRestore();
});
it('rejects aborted guarded creates before dispatch and after deferred fetch or body completion',async()=>{
 const pre=await observe(),controller=new AbortController();controller.abort();await failure(create(input(),'pre-abort',controller.signal,pre),409,'custody-lost');expect(posts).toHaveLength(0);
 for(const phase of ['fetch','body']){posts.length=0;const parent=await observe(),abort=new AbortController(),fetchGate=deferred<Response>(),bodyGate=deferred<string>(),entered=deferred<void>();respond=()=>{if(phase==='fetch'){entered.resolve();return fetchGate.promise;}const response=reply(receipt());response.text=()=>{entered.resolve();return bodyGate.promise;};return response;};const work=create(input(),'abort-key',abort.signal,parent);const caught=work.catch(error=>error);try {await entered.promise;await Promise.resolve();abort.abort();expect(posts[0].signal?.aborted).toBe(true);fetchGate.resolve(reply(receipt()));bodyGate.resolve(JSON.stringify(receipt()));const error=await caught;expect(error).toMatchObject({status:409});expect.soft(classification(error)).toEqual({kind:'custody-lost'});consumed(parent);} finally {fetchGate.resolve(reply(receipt()));bodyGate.resolve(JSON.stringify(receipt()));await caught;}}
});
it('rejects owner replacement during deferred fetch or body completion and at wrapper completion',async()=>{
 for(const phase of ['fetch','body','continuation'])for(const id of [account,otherId]){signIn();posts.length=0;const parent=await observe(),fetchGate=deferred<Response>(),bodyGate=deferred<string>(),entered=deferred<void>();respond=()=>{if(phase==='fetch'){entered.resolve();return fetchGate.promise;}const response=reply(receipt());response.text=()=>{entered.resolve();if(phase==='body')return bodyGate.promise;return Promise.resolve(JSON.stringify(receipt())).then(text=>{queueMicrotask(()=>queueMicrotask(()=>signIn(id)));return text;});};return response;};const work=create(input(),'owner-crossing',undefined,parent);const caught=work.catch(error=>error);try {await entered.promise;if(phase!=='continuation')signIn(id);fetchGate.resolve(reply(receipt()));bodyGate.resolve(JSON.stringify(receipt()));const error=await caught;expect(error).toMatchObject({status:409});expect.soft(classification(error)).toEqual({kind:'custody-lost'});consumed(parent);} finally {fetchGate.resolve(reply(receipt()));bodyGate.resolve(JSON.stringify(receipt()));await caught;}}
});
