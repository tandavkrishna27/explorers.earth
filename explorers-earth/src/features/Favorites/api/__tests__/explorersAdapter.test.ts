import {beforeEach,describe,it,expect,vi} from 'vitest';
import {PlacesClient} from '../placesClient';
import {readPlacesOwnerContent} from '../explorersAdapter';
import useAuthStore from '../../../../store/store';

vi.mock('../placesClient',()=>({PlacesClient:{readCompleteOwner:vi.fn(),observeRecommendation:vi.fn(),observeCollection:vi.fn()}}));
vi.mock('../placesViewModel',async orig=>({...(await orig() as object),placesViewModel:{complete:vi.fn(()=>({lists:[]}))}}));

describe('Places owner read orchestration',()=>{
 beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});});
 // Places hydrates lists as well as recommendations, because a list's location travels on
 // the editable list read rather than in the category page.
 const observed=(recommendations:number,collections=0)=>({revision:'1',pinRevision:1,memberships:[],topPicks:[],
  collections:Array.from({length:collections},(_,i)=>({id:`list-${i}`,revision:1})),
  recommendations:Array.from({length:recommendations},(_,i)=>({id:String(i),revision:1}))});
 const fresh=()=>({detail:{revision:1,categoryRevision:'1'}}) as never;

 it('never returns a view built on a category observation that changed under it',async()=>{
  const first=observed(1,1);
  vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValueOnce(first as never).mockResolvedValueOnce({...first,revision:'2'} as never);
  vi.mocked(PlacesClient.observeRecommendation).mockResolvedValue(fresh());
  vi.mocked(PlacesClient.observeCollection).mockResolvedValue(fresh());
  await expect(readPlacesOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('rejects a place detail whose revision or category revision does not match',async()=>{
  for(const detail of [{revision:2,categoryRevision:'1'},{revision:1,categoryRevision:'2'}]){
   vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
   vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
   vi.mocked(PlacesClient.observeRecommendation).mockResolvedValue({detail} as never);
   await expect(readPlacesOwnerContent()).rejects.toMatchObject({status:409});
  }
 });

 it('rejects a list whose revision or category revision does not match',async()=>{
  // A stale list read is how a changed location would be shown against fresh places.
  for(const detail of [{revision:2,categoryRevision:'1'},{revision:1,categoryRevision:'2'}]){
   vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
   vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(0,1) as never);
   vi.mocked(PlacesClient.observeCollection).mockResolvedValue({detail} as never);
   await expect(readPlacesOwnerContent()).rejects.toMatchObject({status:409});
  }
 });

 it('rejects owner epoch drift during detail completion',async()=>{
  vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(PlacesClient.observeRecommendation).mockImplementation(async()=>{useAuthStore.setState({generation:2});return fresh();});
  await expect(readPlacesOwnerContent()).rejects.toMatchObject({status:409});
 });

 it('holds a four-reader maximum per fan-out and returns the authentic final observation',async()=>{
  const snapshot=observed(12,9);vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(snapshot as never);
  let places=0,placesMax=0,lists=0,listsMax=0;
  vi.mocked(PlacesClient.observeRecommendation).mockImplementation(async()=>{places++;placesMax=Math.max(placesMax,places);await Promise.resolve();places--;return fresh();});
  vi.mocked(PlacesClient.observeCollection).mockImplementation(async()=>{lists++;listsMax=Math.max(listsMax,lists);await Promise.resolve();lists--;return fresh();});
  const value=await readPlacesOwnerContent();
  expect(value.observation).toBe(snapshot);
  expect(value.details.size).toBe(12);expect(value.lists.size).toBe(9);
  expect(placesMax).toBeLessThanOrEqual(4);expect(listsMax).toBeLessThanOrEqual(4);
 });

 it('stops future claims after a terminal failure and preserves the first error',async()=>{
  vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(5) as never);
  const pending:Array<{resolve:(v:unknown)=>void;reject:(r:unknown)=>void}>=[];
  vi.mocked(PlacesClient.observeRecommendation).mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve:resolve as (v:unknown)=>void,reject})));
  const sentinel={terminal:'first'};
  const caller=new AbortController(),removed=vi.spyOn(caller.signal,'removeEventListener');
  const work=readPlacesOwnerContent(caller.signal);let failure:unknown;const settled=work.catch(error=>{failure=error;});
  await vi.waitFor(()=>expect(pending).toHaveLength(4));
  pending[0].reject(sentinel);
  await settled;
  expect(failure).toBe(sentinel);
  expect(removed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(PlacesClient.observeRecommendation).mock.calls.slice(0,4).every(call=>(call[1] as AbortSignal).aborted)).toBe(true);
  pending[1].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
  expect(PlacesClient.observeRecommendation).toHaveBeenCalledTimes(4);
  expect(PlacesClient.readCompleteOwner).toHaveBeenCalledTimes(1);
 });

 it('aborts the list fan-out when a place read fails, so neither half outlives the other',async()=>{
  vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(1,5) as never);
  const sentinel={terminal:'place'};
  const listCalls:AbortSignal[]=[];
  vi.mocked(PlacesClient.observeRecommendation).mockRejectedValue(sentinel);
  vi.mocked(PlacesClient.observeCollection).mockImplementation(async(_id,signal)=>{listCalls.push(signal as AbortSignal);await Promise.resolve();return fresh();});
  await expect(readPlacesOwnerContent()).rejects.toBe(sentinel);
  expect(listCalls.length).toBeGreaterThan(0);
  expect(listCalls.some(signal=>signal.aborted)).toBe(true);
 });

 it('acquires no transport for a preaborted caller and removes its listener',async()=>{
  const caller=new AbortController();caller.abort();const remove=vi.spyOn(caller.signal,'removeEventListener');
  await expect(readPlacesOwnerContent(caller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(PlacesClient.observeRecommendation).not.toHaveBeenCalled();
  expect(PlacesClient.observeCollection).not.toHaveBeenCalled();
  expect(remove).toHaveBeenCalledTimes(1);
 });

 it('removes caller forwarding after a successful hydration and brackets with two reads',async()=>{
  vi.mocked(PlacesClient.readCompleteOwner).mockResolvedValue(observed(0) as never);
  const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');
  await readPlacesOwnerContent(caller.signal);
  expect(remove).toHaveBeenCalledTimes(1);expect(PlacesClient.readCompleteOwner).toHaveBeenCalledTimes(2);
 });
});
