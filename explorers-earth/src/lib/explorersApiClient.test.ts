import { beforeEach, describe, expect, it, vi } from "vitest";
import useAuthStore from "../store/store";
import { explorersApiClient } from "./explorersApiClient";

function signIn(accountId: string) {
  const generation = useAuthStore.getState().beginVerification();
  useAuthStore.getState().acceptVerified(generation, { id: accountId, userId: `user-${accountId}`,
    username: accountId, email: `${accountId}@example.invalid`, onboardingStatus: "complete", revision: 1 });
}
describe('authentic Games membership wire',()=>{
 const account='00000000-0000-4000-8000-000000000001',listId='00000000-0000-4000-8000-000000000002',recId='00000000-0000-4000-8000-000000000003',entityId='00000000-0000-4000-8000-000000000004';
 const collection={id:listId,accountId:account,category:'games',title:'List',slug:'list',visibility:'private',publicationState:'draft',revision:4,description:null,heading:null,coverMediaId:null};
 const recommendation={id:recId,accountId:account,category:'games',entityId,userRating:null,publicationState:'draft',revision:2,mediaIds:[]};
 const collectionDetail={...collection,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9'};
 const recommendationDetail={...recommendation,archived:false,pin:null,note:null,categoryRevision:'9',entity:{id:entityId,kind:'game',title:'Manual'},displayOverrides:{},displayTitle:'Manual',gamePresentation:{version:'explorers-manual-game/v1',origin:'manual',providerExternalId:null,providerFacts:null,images:[],coverMediaId:null}};
 const reply=(value:unknown)=>new Response(JSON.stringify(value),{status:200});
 beforeEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();signIn(account);history.replaceState({},'','/games');});
 async function observations(mutation:(options:RequestInit)=>Promise<Response>|Response){
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>options.method?mutation(options):reply(url.includes('/collections/')?{collection:collectionDetail}:{recommendation:recommendationDetail})));
  return {parent:await explorersApiClient.getMyEditableCollection(listId),item:await explorersApiClient.getMyEditableRecommendation(recId)};
 }
 it('sends original paired revisions/key and validates both authenticated resource identities',async()=>{
  let sent:RequestInit|undefined;const {parent,item}=await observations(options=>{sent=options;return reply({membership:{collection:{...collection,revision:5},recommendation:{...recommendation,revision:3},attached:true}});});
  await expect(explorersApiClient.attachMyGameMembership({...parent},item,'paired-key')).rejects.toMatchObject({status:409});
  const result=await explorersApiClient.attachMyGameMembership(parent,item,'paired-key');expect(JSON.parse(sent!.body as string)).toEqual({expectedCollectionRevision:4,expectedRecommendationRevision:2});expect((sent!.headers as Record<string,string>)['Idempotency-Key']).toBe('paired-key');expect(result.collection.revision).toBe(5);
  await expect(explorersApiClient.attachMyGameMembership(parent,item,'paired-new-key')).rejects.toMatchObject({status:409});
 });
 it('preserves original observations for lost acknowledgement replay without rebasing',async()=>{
  let count=0;const bodies:string[]=[];const {parent,item}=await observations(options=>{bodies.push(options.body as string);if(++count===1)throw Error('lost');return reply({membership:{collection:{...collection,revision:5},recommendation:{...recommendation,revision:3},attached:false}});});
  await expect(explorersApiClient.detachMyGameMembership(parent,item,'paired-replay')).rejects.toMatchObject({status:503});await explorersApiClient.detachMyGameMembership(parent,item,'paired-replay');expect(bodies[0]).toBe(bodies[1]);
 });
 it.each(['id','revision','category','entityId'] as const)('rejects mismatched compound recommendation %s',async(field)=>{
  const value={id:listId,revision:4,category:'books',entityId:listId}[field],{parent,item}=await observations(()=>reply({membership:{collection:{...collection,revision:5},recommendation:{...recommendation,revision:3,[field]:value},attached:true}}));
  await expect(explorersApiClient.attachMyGameMembership(parent,item,'paired-invalid')).rejects.toMatchObject({status:503});
 });
 it('denies an account generation crossing while the membership reply settles',async()=>{
  let release!:(value:Response)=>void;const {parent,item}=await observations(()=>new Promise(resolve=>{release=resolve;}));const work=explorersApiClient.attachMyGameMembership(parent,item,'paired-deferred');signIn(account);release(reply({membership:{collection:{...collection,revision:5},recommendation:{...recommendation,revision:3},attached:true}}));await expect(work).rejects.toMatchObject({status:409});
 });
 it('bounds noncooperative body cancellation and preserves paired replay after deadline ambiguity',async()=>{
  let calls=0;const {parent,item}=await observations(()=>++calls===1?new Response(new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})}),{status:200}):reply({membership:{collection:{...collection,revision:5},recommendation:{...recommendation,revision:3},attached:true}}));
  const controller=new AbortController(),timeout=vi.spyOn(AbortSignal,'timeout').mockReturnValueOnce(controller.signal);
  try{const work=explorersApiClient.attachMyGameMembership(parent,item,'paired-timeout').then(()=>0,error=>error.status);await Promise.resolve();controller.abort(new DOMException('Deadline','TimeoutError'));expect(await Promise.race([work,new Promise(resolve=>setTimeout(()=>resolve('pending'),30))])).toBe(503);await explorersApiClient.attachMyGameMembership(parent,item,'paired-timeout');}finally{timeout.mockRestore();}
 });
});

describe("canonical API session expiry", () => {
  beforeEach(() => { useAuthStore.getState().logout(); vi.unstubAllGlobals(); });
  it("handles simultaneous definitive 401 responses with one generation transition", async () => {
    signIn("account-a");
    const before = useAuthStore.getState().generation;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 })));
    const results = await Promise.allSettled([explorersApiClient.getMyProfile(), explorersApiClient.getMyProfile()]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    expect(useAuthStore.getState().generation).toBe(before + 1);
    expect(useAuthStore.getState().status).toBe("signed-out");
  });
  it("never lets an old 401 log out a new A→B→A session", async () => {
    signIn("account-a");
    let release!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const old = explorersApiClient.getMyProfile();
    signIn("account-b"); signIn("account-a");
    const current = useAuthStore.getState().generation;
    release(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }));
    await expect(old).rejects.toMatchObject({ status: 401 });
    expect(useAuthStore.getState().generation).toBe(current);
    expect(useAuthStore.getState().status).toBe("active-complete");
  });
  it("keeps an active session on 403, 404 and transport outage", async () => {
    signIn("account-a");
    for (const status of [403, 404]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "FORBIDDEN" } }), { status })));
      await expect(explorersApiClient.getMyProfile()).rejects.toMatchObject({ status });
      expect(useAuthStore.getState().status).toBe("active-complete");
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await expect(explorersApiClient.getMyProfile()).rejects.toThrow("offline");
    expect(useAuthStore.getState().status).toBe("active-complete");
  });
});

// Real issued observations and native Places adapter; only HTTP is replaced.
describe('Places collection share slug wire', () => {
 const account='00000000-0000-4000-8000-000000000101',id='00000000-0000-4000-8000-000000000102';
 const base={id,accountId:account,category:'places',title:'Location',slug:'original-location',visibility:'private',publicationState:'draft',revision:4,description:'Preserved',heading:null,coverMediaId:null};
 beforeEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();signIn(account);history.replaceState({},'','/places');});
 async function observe(category='places') {
  const patches:RequestInit[]=[];
  vi.stubGlobal('fetch',vi.fn(async(_url:string,options:RequestInit)=>{
   if(options.method==='PATCH'){patches.push(options);const {expectedRevision,...patch}=JSON.parse(options.body as string);return new Response(JSON.stringify({collection:{...base,category,...patch,revision:expectedRevision+1}}),{status:200});}
   return new Response(JSON.stringify({collection:{...base,category,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9',...(category==='places'?{linkedChildren:[],placeLocation:{locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}}:category==='products'||category==='people'?{locationLink:null}:{})}}),{status:200});
  }));
  const {PlacesClient}=await import('../features/Favorites/api/placesClient');
  return {PlacesClient,patches,observed:category==='places'?await PlacesClient.observeCollection(id):await explorersApiClient.getMyEditableCollection(id)};
 }
 it.each(['changed-location','original-location'])('accepts valid changed or unchanged slug %s with original observation and key',async slug=>{
  const {PlacesClient,patches,observed}=await observe(),patch={title:'Edited location',slug};
  const saved=await PlacesClient.updateCollection(observed,patch,'places-slug-key').catch(error=>{expect(error).toMatchObject({status:422,code:'INVALID_INPUT'});expect(patches).toHaveLength(0);throw error;});
  expect(saved).toMatchObject({id,slug,title:patch.title,revision:5});expect(patches).toHaveLength(1);
  expect(JSON.parse(patches[0].body as string)).toEqual({...patch,expectedRevision:4});expect(new Headers(patches[0].headers).get('Idempotency-Key')).toBe('places-slug-key');
 });
 it('rejects malformed slug before PATCH and preserves ordinary omitted-slug updates',async()=>{
  const {PlacesClient,patches,observed}=await observe();
  for(const slug of ['', 'UPPER','double--dash','-leading','trailing-','spaces here','x'.repeat(201)])await expect(PlacesClient.updateCollection(observed,{title:'Edited',slug} as any,'places-bad-slug')).rejects.toMatchObject({status:422,code:'INVALID_INPUT'});
  expect(patches).toHaveLength(0);expect(await PlacesClient.updateCollection(observed,{title:'Ordinary'},'places-ordinary')).toMatchObject({slug:base.slug,title:'Ordinary',revision:5});expect(patches).toHaveLength(1);
 });
 it.each(['guides','movies','books','games','apps','products','people'])('rejects supplied slug for observed %s before PATCH',async category=>{
  const {patches,observed}=await observe(category);
  await expect(explorersApiClient.updateMyCollection(observed,{slug:'changed-slug'} as any,'other-slug-key')).rejects.toMatchObject({status:422,code:'INVALID_INPUT'});expect(patches).toHaveLength(0);
  expect(await explorersApiClient.updateMyCollection(observed,{title:'Ordinary'},'other-ordinary-key')).toMatchObject({slug:base.slug,title:'Ordinary',revision:5});
 });
});
