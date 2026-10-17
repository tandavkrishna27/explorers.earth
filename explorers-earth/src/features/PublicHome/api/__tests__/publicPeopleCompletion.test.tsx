import {renderHook,waitFor,act} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
const gateway=vi.hoisted(()=>({category:vi.fn(),categoryPage:vi.fn(),detailPage:vi.fn(),peekCategory:vi.fn()}));
vi.mock('../publicProfileGatewayClient',()=>({publicProfileGatewayClient:gateway}));
import {usePublicRecommendationCategory} from '../usePublicRecommendationCategory';
import {publishPublicProfileInvalidation} from '../publicProfileInvalidation';
import {completePeoplePreviews} from '../../../People/api/publicPeopleSectorViewModel';
const list=(id:string,rows:unknown[]=[],cursor:string|null=null)=>({documentId:id,slug:id,List_Name:id,recommended_people:rows,recommended_people_next_cursor:cursor});
beforeEach(()=>Object.values(gateway).forEach(fn=>fn.mockReset()));
it('completes child previews beyond twelve and preserves distinct recommendations in server order',async()=>{
 const rows=Array.from({length:12},(_,i)=>({documentId:'r'+i,profile_url:'https://same.example',user_recommendation_note:'note'+i}));
 gateway.category.mockResolvedValue({personLists:[list('first',rows,'o12')]});
 gateway.detailPage.mockResolvedValue({personLists:[list('first',[{documentId:'later',profile_url:'https://same.example',user_recommendation_note:'later note'}])]});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));
 await waitFor(()=>expect(result.current.loading).toBe(false));
 expect((result.current.data!.personLists[0] as any).recommended_people.map((p:any)=>p.documentId)).toEqual([...rows.map(p=>p.documentId),'later']);
 expect((result.current.data!.personLists[0] as any).recommended_people[12].user_recommendation_note).toBe('later note');
});
it('accounts for the first overview page in the64MiB preview aggregate before cloning or following cursors',async()=>{
 const raw={personLists:[list('first',[{documentId:'initial',user_recommendation_note:'n'.repeat(8192)}],'o12')]};const read=vi.fn(),budget={bytes:64*1024*1024-new TextEncoder().encode(JSON.stringify(raw)).length+1};
 const outcome=completePeoplePreviews(raw,read,new AbortController().signal,budget).then(()=> 'accepted',error=>error.message);
 expect(await outcome).toBe('PUBLIC_PROFILE_READ_LIMIT');expect(read).not.toHaveBeenCalled();
});
it('fails closed when first preview plus continuation crosses64MiB rather than returning truncated rows with null cursor',async()=>{
 const row={documentId:'large',user_recommendation_note:'n'.repeat(8192)},raw={personLists:[list('first',[row],'o12')]},continuation={personLists:[list('first',[row])]};const read=vi.fn().mockResolvedValue(continuation);
 const budget={bytes:64*1024*1024-new TextEncoder().encode(JSON.stringify(raw)).length-new TextEncoder().encode(JSON.stringify(continuation)).length+1};
 const outcome=completePeoplePreviews(raw,read,new AbortController().signal,budget).then(()=> 'accepted',error=>error.message);expect(await outcome).toBe('PUBLIC_PROFILE_READ_LIMIT');expect(read).toHaveBeenCalledOnce();
});
it('enforces the aggregate budget across overview category pages and leaves an explicit continuation error instead of claiming completion',async()=>{
 let pages=0;const note='n'.repeat(8192);const next=()=>{pages++;return {personLists:Array.from({length:12},(_,i)=>list('p'+pages+'l'+i,Array.from({length:12},(_,j)=>({documentId:'p'+pages+'l'+i+'r'+j,user_recommendation_note:note}))))}};
 gateway.category.mockImplementation(async()=>next());gateway.categoryPage.mockImplementation(async()=>next());
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 for(let n=0;n<100&&!result.current.loadMoreError;n++)await act(()=>result.current.loadMore());
 expect(result.current.loadMoreError).toEqual(Error('PUBLIC_PROFILE_READ_LIMIT'));expect(result.current.hasMore).toBe(true);expect(result.current.data!.personLists).toHaveLength((pages-1)*12);expect(pages).toBeLessThan(60);
});
it('ignores a late overview child response after withdrawal, aborts the old generation, and keeps fresh eligibility authoritative',async()=>{
 let deliver!:(value:any)=>void;gateway.category.mockResolvedValueOnce({personLists:[list('first',[{documentId:'initial'}],'o12')]}).mockResolvedValueOnce({personLists:[]});gateway.detailPage.mockImplementationOnce(()=>new Promise(resolve=>{deliver=resolve}));
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));await waitFor(()=>expect(gateway.detailPage).toHaveBeenCalledOnce());const signal=gateway.detailPage.mock.calls[0][4];
 act(()=>publishPublicProfileInvalidation({username:'reader',category:'public_people',action:'unpublish',accountDocumentId:'account',eventId:'overview-late'}));expect(signal.aborted).toBe(true);await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data).toEqual({personLists:[]});
 await act(async()=>deliver({personLists:[list('first',[{documentId:'withdrawn'}])]}));expect(result.current.data).toEqual({personLists:[]});expect(result.current.error).toBeNull();
});
it('validates the list identity returned by child continuation',async()=>{
 gateway.category.mockResolvedValue({personLists:[list('first',[],'o12')]});gateway.detailPage.mockResolvedValue({personLists:[list('wrong')]});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.error).toBeTruthy();expect(result.current.data).toBeUndefined();
});
it('continues later lists and their previews using the backend offset contract',async()=>{
 gateway.category.mockResolvedValue({personLists:Array.from({length:12},(_,i)=>list('l'+i))});
 gateway.categoryPage.mockResolvedValue({personLists:[list('later',[],'o12')]});
 gateway.detailPage.mockResolvedValue({personLists:[list('later',[{documentId:'last'}])]});
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));await waitFor(()=>expect(result.current.loading).toBe(false));await act(()=>result.current.loadMore());
 expect((result.current.data!.personLists[12] as any).recommended_people).toEqual([{documentId:'last'}]);expect(result.current.hasMore).toBe(false);
});
it('clears the old People collection immediately on public withdrawal while the new request is pending',async()=>{
 gateway.category.mockResolvedValueOnce({personLists:[list('old')]}).mockImplementationOnce(()=>new Promise(()=>{}));
 const {result}=renderHook(()=>usePublicRecommendationCategory('reader','people',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 act(()=>publishPublicProfileInvalidation({username:'reader',category:'public_people',action:'unpublish',accountDocumentId:'account',eventId:'overview-clear'}));
 expect(result.current.data).toBeUndefined();
});
