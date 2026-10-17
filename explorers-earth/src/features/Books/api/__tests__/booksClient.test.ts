import {describe,it,expect,vi,beforeEach} from 'vitest';
import {explorersApiClient} from '../../../../lib/explorersApiClient';
import {readBooksOwnerContent} from '../booksClient';
import {emptyBookDetails} from '../../../../../../tunes/shared/explorersBookContract';
import useAuthStore from '../../../../store/store';
vi.mock('../../../../lib/explorersApiClient',()=>({explorersApiClient:{getCompleteMyCategoryTopPicks:vi.fn(),getMyEditableRecommendation:vi.fn()},assertCompleteMyCategoryContent:vi.fn(),ExplorersApiError:class extends Error{constructor(public status:number,public code:string,message:string){super(message)}}}));
describe('bounded rich Books hydration',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('validates the final complete observation and rejects a revision changed during details',async()=>{
  const first={revision:'1',collections:[],memberships:[],recommendations:[{id:'rec',revision:1}],topPicks:[]};
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValueOnce(first as never).mockResolvedValueOnce({...first,revision:'2'} as never);
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockResolvedValue({detail:{id:'rec',revision:1,categoryRevision:'1'}} as never);
  await expect(readBooksOwnerContent()).rejects.toMatchObject({status:409});
  expect(explorersApiClient.getCompleteMyCategoryTopPicks).toHaveBeenCalledTimes(2);
 });
 it('never reports partial hydration complete when any detail fails',async()=>{
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue({revision:'1',collections:[],memberships:[],recommendations:[{id:'rec',revision:1}],topPicks:[]} as never);
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockRejectedValue(new Error('unavailable'));
  await expect(readBooksOwnerContent()).rejects.toThrow('unavailable');
 });
 it('hydrates every child with at most four readers and preserves the verified share handle',async()=>{
  useAuthStore.setState({user:{id:'identity',documentId:'owner',username:'reader',email:'fixture@example.invalid',blocked:false}});
  const recommendations=Array.from({length:28},(_,n)=>({id:`rec${n}`,revision:1}));
  const observed={revision:'1',pinRevision:1,collections:[{id:'list',accountId:'owner',title:'Reading',slug:'reading',displayOrder:0,visibility:'private',publicationState:'draft'}],memberships:recommendations.map((r,n)=>({recommendationId:r.id,collectionId:'list',displayOrder:n})),recommendations,topPicks:[]};
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(observed as never);
  let concurrent=0,maximum=0;
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockImplementation(async id=>{
   concurrent++;maximum=Math.max(maximum,concurrent);await new Promise(resolve=>setTimeout(resolve,0));concurrent--;
   return {detail:{id,entityId:'entity',entity:{provenance:null},displayTitle:id,revision:1,categoryRevision:'1',effectiveBookDetails:emptyBookDetails(),mediaIds:[]}} as never;
  });
  const content=await readBooksOwnerContent();expect(maximum).toBeLessThanOrEqual(4);expect(content.details.size).toBe(28);expect(content.lists[0].recommended_books).toHaveLength(28);expect(content.lists[0].account?.username).toBe('reader');
 });
 it('rejects an aggregate detail read beyond the finite byte budget',async()=>{
  vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue({revision:'1',collections:[],memberships:[],recommendations:[{id:'rec',revision:1}],topPicks:[]} as never);
  vi.mocked(explorersApiClient.getMyEditableRecommendation).mockResolvedValue({detail:{id:'rec',revision:1,categoryRevision:'1'}} as never);
  const encoding=vi.spyOn(TextEncoder.prototype,'encode').mockReturnValueOnce({length:64*1024*1024+1} as Uint8Array);
  try{await expect(readBooksOwnerContent()).rejects.toMatchObject({status:422,code:'READ_LIMIT'});}finally{encoding.mockRestore();}
 });
});

// A failed worker cannot leave surviving workers claiming new detail indices.
it.each(['transport','undefined','resource-revision','category-revision','bytes'] as const)('stops future claims after %s terminal failure and preserves the first error',async mode=>{
 vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});
 const observed={revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:Array.from({length:5},(_,n)=>({id:String(n),revision:1}))};
 vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(observed as never);
 const pending:Array<{resolve:(value:unknown)=>void;reject:(reason:unknown)=>void}>=[];
 vi.mocked(explorersApiClient.getMyEditableRecommendation).mockImplementation(()=>new Promise((resolve,reject)=>pending.push({resolve:resolve as (value:unknown)=>void,reject})));
 const sentinel=mode==='undefined'?undefined:{terminal:'first'};const caller=new AbortController();const removed=vi.spyOn(caller.signal,'removeEventListener');const work=readBooksOwnerContent(caller.signal);let failure:unknown;const settled=work.catch(error=>{failure=error;});
 await vi.waitFor(()=>expect(pending).toHaveLength(4));if(mode==='transport'||mode==='undefined')pending[0].reject(sentinel);else pending[0].resolve({detail:{revision:mode==='resource-revision'?2:1,categoryRevision:mode==='category-revision'?'2':'1',...(mode==='bytes'?{oversized:'x'.repeat(64*1024*1024+1)}:{})}});await settled;if(mode==='transport'||mode==='undefined')expect(failure).toBe(sentinel);else expect(failure).toMatchObject({code:mode==='bytes'?'READ_LIMIT':'CONFLICT'});const originalFailure=failure;expect(removed).toHaveBeenCalledTimes(1);const signals=vi.mocked(explorersApiClient.getMyEditableRecommendation).mock.calls.slice(0,4).map(call=>call[1] as AbortSignal);expect(signals.every(value=>value!==caller.signal&&value.aborted)).toBe(true);
 pending[1].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();await Promise.resolve();
 expect(explorersApiClient.getMyEditableRecommendation).toHaveBeenCalledTimes(4);expect(explorersApiClient.getCompleteMyCategoryTopPicks).toHaveBeenCalledTimes(1);
 pending[2].reject({terminal:'late'});pending[3].resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();expect(failure).toBe(originalFailure);
});


it('does not acquire any category transport for a preaborted caller and removes its listener',async()=>{vi.clearAllMocks();const caller=new AbortController();caller.abort();const remove=vi.spyOn(caller.signal,'removeEventListener');await expect(readBooksOwnerContent(caller.signal)).rejects.toMatchObject({name:'AbortError'});expect(explorersApiClient.getMyEditableRecommendation).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledTimes(1);});

it('forwards caller cancellation to admitted siblings and prevents late new claims',async()=>{
 vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});const observed={revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:Array.from({length:5},(_,n)=>({id:String(n),revision:1}))};vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(observed as never);
 const pending:Array<(v:unknown)=>void>=[];vi.mocked(explorersApiClient.getMyEditableRecommendation).mockImplementation(()=>new Promise(resolve=>pending.push(resolve as (v:unknown)=>void)));const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');const work=readBooksOwnerContent(caller.signal);const failure=work.catch(e=>e);await vi.waitFor(()=>expect(pending).toHaveLength(4));caller.abort();expect(vi.mocked(explorersApiClient.getMyEditableRecommendation).mock.calls.every(call=>(call[1] as AbortSignal).aborted)).toBe(true);pending[0]({detail:{revision:1,categoryRevision:'1'}});expect(await failure).toMatchObject({name:'AbortError'});for(const resolve of pending.slice(1))resolve({detail:{revision:1,categoryRevision:'1'}});await Promise.resolve();await Promise.resolve();expect(explorersApiClient.getMyEditableRecommendation).toHaveBeenCalledTimes(4);expect(explorersApiClient.getCompleteMyCategoryTopPicks).toHaveBeenCalledTimes(1);expect(remove).toHaveBeenCalledTimes(1);
});
it('removes caller forwarding after successful complete hydration',async()=>{vi.clearAllMocks();useAuthStore.setState({accountId:'owner',generation:1});const observed={revision:'1',pinRevision:1,collections:[],memberships:[],topPicks:[],recommendations:[]};vi.mocked(explorersApiClient.getCompleteMyCategoryTopPicks).mockResolvedValue(observed as never);const caller=new AbortController(),remove=vi.spyOn(caller.signal,'removeEventListener');await readBooksOwnerContent(caller.signal);expect(remove).toHaveBeenCalledTimes(1);expect(explorersApiClient.getCompleteMyCategoryTopPicks).toHaveBeenCalledTimes(2);});
