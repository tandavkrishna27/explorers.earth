import {beforeEach,describe,it,expect,vi} from 'vitest';
import {PeopleClient} from '../peopleClient';
import {personViewModel} from '../peopleViewModel';
import {readPeopleOwnerContent} from '../explorersAdapter';
import useAuthStore from '../../../../store/store';

vi.mock('../peopleClient',()=>({PeopleClient:{readCompleteOwner:vi.fn(),observeRecommendation:vi.fn()}}));
// personViewModel stays real so the alias comparisons below are the ones the UI gets;
// only complete() is stubbed, for the orchestration cases.
vi.mock('../peopleViewModel',async orig=>({...(await orig() as object),peopleViewModel:{complete:vi.fn(()=>({lists:[]}))}}));

const id=(n:number)=>`00000000-0000-4000-8000-00000000000${n}`;
const facts={usernameHandle:'alexlee',headline:'Designer',locationText:'Lisbon',avatarUrl:'https://example.com/a.png',
 primaryPlatform:'twitter',socialUrls:{twitter:'https://example.com/alex'},skillsTags:['design','type'],externalFollowerCountText:'12.4k'};
const detail=(over:Record<string,unknown>={})=>({id:id(1),entityId:id(1),category:'people',entity:{kind:'person'},displayTitle:'Alex Lee',userRating:7,note:null,effectivePersonDetails:facts,...over} as never);
const membership=(over:Record<string,unknown>={})=>({recommendationId:id(1),collectionId:id(2),displayOrder:0,...over} as never);

describe('canonical fields and compatibility aliases',()=>{
 // The ticket requires comparing canonical and compatibility aliases, which must agree
 // because they come from one source rather than being re-derived per component.
 it('emits each alias from the same fact as its canonical field',()=>{
  const row=personViewModel(detail(),membership());
  expect(row.full_name).toBe(row.name);
  expect(row.handle).toBe(row.username_handle);
  expect(row.avatar_url).toBe(row.avatar_path);
  expect(row.bio).toBe(row.headline);
  expect(row.tags).toEqual(row.skills_tags);
  expect(row.follower_count).toBe('12.4k');
  expect(row.location).toBe('Lisbon');
 });

 it('stores twitter and presents x, keeping both visible without guessing',()=>{
  const row=personViewModel(detail(),membership());
  expect(row.primary_platform).toBe('twitter');
  expect(row.platform).toBe('x');
  // Every other platform presents as itself.
  for(const platform of ['instagram','linkedin','github','youtube','website','other'] as const){
   const other=personViewModel(detail({effectivePersonDetails:{...facts,primaryPlatform:platform}}),membership());
   expect(other.primary_platform).toBe(platform);
   expect(other.platform).toBe(platform);
  }
  const none=personViewModel(detail({effectivePersonDetails:{...facts,primaryPlatform:null}}),membership());
  expect(none.primary_platform).toBeNull();expect(none.platform).toBeNull();
 });

 it('resolves the primary link from the explicit primary, else the stated platform',()=>{
  expect(personViewModel(detail(),membership()).profile_url).toBe('https://example.com/alex');
  const explicit=personViewModel(detail({effectivePersonDetails:{...facts,socialUrls:{primary:'https://example.com/main',twitter:'https://example.com/alex'}}}),membership());
  expect(explicit.profile_url).toBe('https://example.com/main');
  // No link at all leaves the alias absent rather than inventing one.
  const bare=personViewModel(detail({effectivePersonDetails:{...facts,primaryPlatform:null,socialUrls:{}}}),membership());
  expect(bare.profile_url).toBeUndefined();
 });

 it('falls back to a missing avatar as null rather than a placeholder address',()=>{
  const row=personViewModel(detail({effectivePersonDetails:{...facts,avatarUrl:null}}),membership());
  expect(row.avatar_path).toBeNull();expect(row.avatar_url).toBeNull();
 });

 it('maps a person with nothing but a name, with every optional absent',()=>{
  const empty={usernameHandle:null,headline:null,locationText:null,avatarUrl:null,primaryPlatform:null,socialUrls:{},skillsTags:[],externalFollowerCountText:null};
  const row=personViewModel(detail({effectivePersonDetails:empty}),membership());
  expect(row).toMatchObject({name:'Alex Lee',full_name:'Alex Lee',username_handle:null,handle:null,headline:null,bio:null,platform:null});
  // The legacy type models an absent list as null, not as an empty array.
  expect(row.skills_tags).toBeNull();expect(row.tags).toBeNull();
  expect(row.profile_url).toBeUndefined();
 });

 it('reports no sector when no assignment was returned',()=>{
  const row=personViewModel(detail(),membership());
  expect(row.person_category).toBeNull();expect(row.people_category).toBeNull();expect(row.person_categories).toBeNull();
 });

 it.each(['Known label',null])('maps sector identity, canonical slug and %s label from one source',label=>{
  const sector={id:id(3),slug:'canonical-sector',label,unavailable:label===null};
  const row=personViewModel(detail({peopleSector:{catalogState:'CONFIGURED',catalogVersion:2,defaultLocale:'en',sector,selectionUnavailable:label===null}}),membership());
  expect(row.person_category).toMatchObject({id:id(3),documentId:id(3),slug:'canonical-sector',Category_name:label,unavailable:label===null});
  expect(row.people_category).toBe(row.person_category);expect(row.person_categories).toEqual([row.person_category]);
  expect(row.people_sector).toMatchObject({sector,selectionUnavailable:label===null});
 });

 it('refuses wrong category, wrong entity kind, mismatched identity and broken details',()=>{
  for(const changed of [{category:'products'},{entity:{kind:'product'}},{id:id(9)},{effectivePersonDetails:undefined},
   {effectivePersonDetails:{...facts,avatarUrl:'javascript:alert(1)'}},{effectivePersonDetails:{...facts,primaryPlatform:'myspace'}}])
   expect(()=>personViewModel(detail(changed),membership())).toThrow();
 });

 it('does not pin a row through a membership of another collection',()=>{
  const pin={recommendationId:id(1),collectionId:id(2),position:0};
  expect(personViewModel(detail(),membership(),pin).is_pinned).toBe(true);
  expect(personViewModel(detail(),membership({collectionId:id(4)}),pin)).toMatchObject({is_pinned:false,pin_order:null});
 });
});

describe('owner read orchestration',()=>{
 beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});});
 const observed=(n:number)=>({revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:Array.from({length:n},(_,i)=>({id:String(i),revision:1}))});

 it('never returns a view built on a category observation that changed under it',async()=>{
  const first=observed(1);
  vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValueOnce(first as never).mockResolvedValueOnce({...first,revision:'2'} as never);
  vi.mocked(PeopleClient.observeRecommendation).mockResolvedValue({detail:{revision:1,categoryRevision:'1'}} as never);
  await expect(readPeopleOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('rejects a detail whose revision or category revision does not match',async()=>{
  for(const detail of [{revision:2,categoryRevision:'1'},{revision:1,categoryRevision:'2'}]){
   vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
   vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
   vi.mocked(PeopleClient.observeRecommendation).mockResolvedValue({detail} as never);
   await expect(readPeopleOwnerContent()).rejects.toMatchObject({status:409});
  }
 });

 it('rejects owner epoch drift during detail completion',async()=>{
  vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(PeopleClient.observeRecommendation).mockImplementation(async()=>{useAuthStore.setState({generation:2});return {detail:{revision:1,categoryRevision:'1'}} as never;});
  await expect(readPeopleOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('holds a four-reader maximum and returns the authentic final observation',async()=>{
  const snapshot=observed(12);vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValue(snapshot as never);
  let active=0,max=0;
  vi.mocked(PeopleClient.observeRecommendation).mockImplementation(async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return {detail:{revision:1,categoryRevision:'1'}} as never;});
  const value=await readPeopleOwnerContent();
  expect(value.observation).toBe(snapshot);expect(value.details.size).toBe(12);expect(max).toBeLessThanOrEqual(4);
 });

 it('stops future claims after a terminal failure and preserves the first error',async()=>{
  vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValue(observed(5) as never);
  const pending:Array<{resolve:(v:unknown)=>void;reject:(r:unknown)=>void}>=[];
  vi.mocked(PeopleClient.observeRecommendation).mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve:resolve as (v:unknown)=>void,reject})));
  const sentinel={terminal:'first'};
  const caller=new AbortController(),removed=vi.spyOn(caller.signal,'removeEventListener');
  const work=readPeopleOwnerContent(caller.signal);let failure:unknown;const settled=work.catch(error=>{failure=error;});
  await vi.waitFor(()=>expect(pending).toHaveLength(4));
  pending[0].reject(sentinel);
  await settled;
  expect(failure).toBe(sentinel);
  expect(removed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(PeopleClient.observeRecommendation).mock.calls.slice(0,4).every(call=>(call[1] as AbortSignal).aborted)).toBe(true);
  pending[1].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(PeopleClient.observeRecommendation).toHaveBeenCalledTimes(4);
  expect(PeopleClient.readCompleteOwner).toHaveBeenCalledTimes(1);
 });

 it('acquires no transport for a preaborted caller and removes its listener',async()=>{
  const caller=new AbortController();caller.abort();const remove=vi.spyOn(caller.signal,'removeEventListener');
  await expect(readPeopleOwnerContent(caller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(PeopleClient.observeRecommendation).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);
 });

 it('removes caller forwarding after a successful hydration and brackets with two reads',async()=>{
  vi.mocked(PeopleClient.readCompleteOwner).mockResolvedValue(observed(0) as never);
  const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');
  await readPeopleOwnerContent(caller.signal);
  expect(remove).toHaveBeenCalledTimes(1);expect(PeopleClient.readCompleteOwner).toHaveBeenCalledTimes(2);
 });
});
