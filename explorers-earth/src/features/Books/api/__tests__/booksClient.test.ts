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
