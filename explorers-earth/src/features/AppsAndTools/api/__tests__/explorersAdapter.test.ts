import {beforeEach,it,expect,vi} from 'vitest';
import {AppsClient} from '../appsClient';
import {readAppsOwnerContent} from '../explorersAdapter';
import useAuthStore from '../../../../store/store';

// Orchestration only: the mapping itself is asserted for real in appsViewModel.test.ts,
// including complete(), so it is stubbed here to keep each failure attributable.
vi.mock('../appsClient',()=>({AppsClient:{readCompleteOwner:vi.fn(),observeRecommendation:vi.fn()}}));
vi.mock('../appsViewModel',()=>({appsViewModel:{complete:vi.fn(()=>({lists:[]}))}}));
beforeEach(()=>{vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});});
const observed=(n:number)=>({revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:Array.from({length:n},(_,i)=>({id:String(i),revision:1}))});

it('never returns a view built on a category observation that changed under it',async()=>{
 const first=observed(1);
 vi.mocked(AppsClient.readCompleteOwner).mockResolvedValueOnce(first as never).mockResolvedValueOnce({...first,revision:'2'} as never);
 vi.mocked(AppsClient.observeRecommendation).mockResolvedValue({detail:{revision:1,categoryRevision:'1'}} as never);
 await expect(readAppsOwnerContent()).rejects.toMatchObject({status:409});
});

it('rejects a detail whose revision or category revision does not match the observation',async()=>{
 for(const detail of [{revision:2,categoryRevision:'1'},{revision:1,categoryRevision:'2'}]){
  vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
  vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
  vi.mocked(AppsClient.observeRecommendation).mockResolvedValue({detail} as never);
  await expect(readAppsOwnerContent()).rejects.toMatchObject({status:409});
 }
});

it('rejects owner epoch drift during detail completion',async()=>{
 vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(observed(1) as never);
 vi.mocked(AppsClient.observeRecommendation).mockImplementation(async()=>{useAuthStore.setState({generation:2});return {detail:{revision:1,categoryRevision:'1'}} as never;});
 await expect(readAppsOwnerContent()).rejects.toMatchObject({status:409});
});

it('holds a four-reader maximum and returns the authentic final observation',async()=>{
 const snapshot=observed(12);vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(snapshot as never);
 let active=0,max=0;
 vi.mocked(AppsClient.observeRecommendation).mockImplementation(async()=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return {detail:{revision:1,categoryRevision:'1'}} as never;});
 const value=await readAppsOwnerContent();
 expect(value.observation).toBe(snapshot);expect(value.details.size).toBe(12);expect(max).toBeLessThanOrEqual(4);
});

// A failed reader must not leave surviving readers claiming new detail indices.
it.each(['transport','undefined','resource-revision','category-revision','bytes'] as const)('stops future claims after %s terminal failure and preserves the first error',async mode=>{
 vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
 vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(observed(5) as never);
 const pending:Array<{resolve:(value:unknown)=>void;reject:(reason:unknown)=>void}>=[];
 vi.mocked(AppsClient.observeRecommendation).mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve:resolve as (value:unknown)=>void,reject})));
 const sentinel=mode==='undefined'?undefined:{terminal:'first'};
 const caller=new AbortController(),removed=vi.spyOn(caller.signal,'removeEventListener');
 const work=readAppsOwnerContent(caller.signal);let failure:unknown;const settled=work.catch(error=>{failure=error;});
 await vi.waitFor(()=>expect(pending).toHaveLength(4));
 if(mode==='transport'||mode==='undefined')pending[0].reject(sentinel);
 else pending[0].resolve({detail:{revision:mode==='resource-revision'?2:1,categoryRevision:mode==='category-revision'?'2':'1',...(mode==='bytes'?{oversized:'x'.repeat(64*1024*1024+1)}:{})}});
 await settled;
 if(mode==='transport'||mode==='undefined')expect(failure).toBe(sentinel);
 else expect(failure).toMatchObject({code:mode==='bytes'?'READ_LIMIT':'CONFLICT'});
 const originalFailure=failure;
 expect(removed).toHaveBeenCalledTimes(1);
 const signals=vi.mocked(AppsClient.observeRecommendation).mock.calls.slice(0,4).map(call=>call[1] as AbortSignal);
 expect(signals.every(value=>value!==caller.signal&&value.aborted)).toBe(true);
 pending[1].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(AppsClient.observeRecommendation).toHaveBeenCalledTimes(4);
 expect(AppsClient.readCompleteOwner).toHaveBeenCalledTimes(1);
 pending[2].reject({terminal:'late'});pending[3].resolve({detail:{revision:1,categoryRevision:'1'}});
 await Promise.resolve();await Promise.resolve();
 expect(failure).toBe(originalFailure);
});

it('acquires no transport for a preaborted caller and removes its listener',async()=>{
 const caller=new AbortController();caller.abort();const remove=vi.spyOn(caller.signal,'removeEventListener');
 await expect(readAppsOwnerContent(caller.signal)).rejects.toMatchObject({name:'AbortError'});
 expect(AppsClient.observeRecommendation).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);
});

it('forwards caller cancellation to admitted siblings and prevents late claims',async()=>{
 vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(observed(5) as never);
 const pending:Array<(v:unknown)=>void>=[];
 vi.mocked(AppsClient.observeRecommendation).mockImplementation(()=>new Promise(resolve=>pending.push(resolve as (v:unknown)=>void)));
 const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');
 const work=readAppsOwnerContent(caller.signal),failure=work.catch(e=>e);
 await vi.waitFor(()=>expect(pending).toHaveLength(4));
 caller.abort();
 expect(vi.mocked(AppsClient.observeRecommendation).mock.calls.every(call=>(call[1] as AbortSignal).aborted)).toBe(true);
 pending[0]({detail:{revision:1,categoryRevision:'1'}});
 expect(await failure).toMatchObject({name:'AbortError'});
 for(const resolve of pending.slice(1))resolve({detail:{revision:1,categoryRevision:'1'}});
 await Promise.resolve();await Promise.resolve();
 expect(AppsClient.observeRecommendation).toHaveBeenCalledTimes(4);
 expect(AppsClient.readCompleteOwner).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);
});

it('removes caller forwarding after a successful hydration and brackets with two reads',async()=>{
 vi.mocked(AppsClient.readCompleteOwner).mockResolvedValue(observed(0) as never);
 const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');
 await readAppsOwnerContent(caller.signal);
 expect(remove).toHaveBeenCalledTimes(1);expect(AppsClient.readCompleteOwner).toHaveBeenCalledTimes(2);
});
