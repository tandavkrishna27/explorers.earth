import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());vi.mock('../../../PublicHome/api/publicProfileGatewayClient',()=>({publicProfileGatewayClient:{peopleSectorPage:read}}));
import {usePublicPeopleSector} from '../usePublicPeopleSector';
import {publicPersonViewModel} from '../publicPeopleSectorViewModel';
import {publishPublicProfileInvalidation} from '../../../PublicHome/api/publicProfileInvalidation';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const term={documentId:id(100),id:id(100),slug:'sector',Category_name:'Localized default label'};
const person=(n:number)=>({documentId:id(n),title:'Title '+n,full_name:'Person '+n,username_handle:'handle',headline:null,location_text:'Pune',avatar_url:null,platform:'x',primary_platform:'twitter',profile_url:'https://same.example',social_urls:{primary:'https://same.example'},skills_tags:['Code'],follower_count:null,user_recommendation_note:'note'+n,user_rating:null,is_pinned:false,pin_order:null,display_order:n,person_list:{documentId:id(n>24?201:200),List_Name:'List',slug:'list'},person_category:term,people_category:term});
const page=(rows:unknown[],nextCursor:string|null=null,label=term.Category_name)=>({version:'explorers-public-people-sector/v1',sector:{documentId:term.documentId,slug:term.slug,Category_name:label},canonicalSlug:term.slug,redirectSlug:null,recommended_people:rows,nextCursor});
beforeEach(()=>read.mockReset());afterEach(cleanup);
it('traverses 25 rows including later list and equal social URLs without sorting or merging recommendation identities',async()=>{
 read.mockResolvedValueOnce(page(Array.from({length:24},(_,i)=>person(24-i)),'signed')).mockResolvedValueOnce(page([person(25)]));
 const {result}=renderHook(()=>usePublicPeopleSector(' Reader ','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.data?.recommended_people.map(p=>p.documentId)).toEqual([...Array.from({length:24},(_,i)=>id(24-i)),id(25)]);
 expect(result.current.data?.recommended_people[24].person_list.documentId).toBe(id(201));expect(result.current.data?.nextCursor).toBeNull();
 expect(read).toHaveBeenLastCalledWith('reader','sector',{limit:24,cursor:'signed'},expect.any(AbortSignal));
});
it('uses null alone as completion, including a short non-final page',async()=>{
 read.mockResolvedValueOnce(page([person(1)],'signed')).mockResolvedValueOnce(page([]));
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data?.recommended_people).toHaveLength(1);expect(read).toHaveBeenCalledTimes(2);
});
it('discards a mixed traversal on continuation400 and restarts first page once with the same limit',async()=>{
 read.mockResolvedValueOnce(page([person(1)],'old')).mockRejectedValueOnce(Error('PUBLIC_PROFILE_400')).mockResolvedValueOnce(page([person(2)],'new')).mockResolvedValueOnce(page([person(3)]));
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));
 expect(result.current.data?.recommended_people.map(p=>p.documentId)).toEqual([id(2),id(3)]);expect(read.mock.calls.map(c=>c[2])).toEqual([{limit:24},{limit:24,cursor:'old'},{limit:24},{limit:24,cursor:'new'}]);
});
it.each([false,true])('surfaces a %s repeated-or-first400 failure without looping or retaining data',async(repeated)=>{
 if(repeated)read.mockResolvedValueOnce(page([person(1)],'old')).mockRejectedValueOnce(Error('PUBLIC_PROFILE_400')).mockResolvedValueOnce(page([person(2)],'new'));
 read.mockRejectedValueOnce(Error('PUBLIC_PROFILE_400'));
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.data).toBeUndefined();expect(result.current.error).toEqual(Error('PUBLIC_PROFILE_400'));expect(read).toHaveBeenCalledTimes(repeated?4:1);
});
it('aborts on username/sector scope changes and isolates responses from transports that ignore abort',async()=>{
 let resolve!:(v:any)=>void;read.mockImplementationOnce(()=>new Promise(r=>{resolve=r})).mockResolvedValueOnce(page([person(2)]));
 const {result,rerender}=renderHook(({user,slug})=>usePublicPeopleSector(user,slug,true),{initialProps:{user:'first',slug:'sector'}});
 const signal=read.mock.calls[0][3];rerender({user:'second',slug:'sector'});expect(signal.aborted).toBe(true);await waitFor(()=>expect(result.current.data?.recommended_people[0].documentId).toBe(id(2)));
 await act(async()=>resolve(page([person(1)])));expect(result.current.data?.recommended_people[0].documentId).toBe(id(2));
 read.mockImplementationOnce(()=>new Promise(()=>{}));rerender({user:'second',slug:'other-sector'});expect(result.current.data).toBeUndefined();
});
it('aborts and clears on eligibility loss, and invalidation replaces labels using stable canonical identity',async()=>{
 read.mockResolvedValueOnce(page([person(1)])).mockResolvedValueOnce(page([person(2)],null,'Edited label'));
 const {result,rerender}=renderHook(({enabled})=>usePublicPeopleSector('reader','sector',enabled),{initialProps:{enabled:true}});await waitFor(()=>expect(result.current.loading).toBe(false));
 act(()=>publishPublicProfileInvalidation({username:'reader',category:'public_people',eventId:'edited-sector',accountDocumentId:'account',action:'content-changed'}));expect(result.current.data).toBeUndefined();
 await waitFor(()=>expect(result.current.data?.sector.Category_name).toBe('Edited label'));expect(result.current.data?.canonicalSlug).toBe('sector');
 read.mockImplementationOnce(()=>new Promise(()=>{}));let pending!:Promise<void>;act(()=>{pending=result.current.refetch()});const signal=read.mock.calls[read.mock.calls.length-1][3];rerender({enabled:false});expect(signal.aborted).toBe(true);expect(result.current.data).toBeUndefined();await act(()=>pending);
});
it('rejects malformed strict DTO and cross-sector metadata instead of hydrating fallback fields',async()=>{
 read.mockResolvedValueOnce({...page([person(1)]),ownerSecret:'not allowed'});
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.error).toEqual(Error('PUBLIC_PROFILE_INVALID_RESPONSE'));
});
it('maps only approved public facts and does not fabricate biography, media or owner fields',()=>{
 const mapped=publicPersonViewModel(person(1));expect(mapped).toMatchObject({name:'Title 1',handle:'handle',location:'Pune',tags:['Code'],platform:'x',primary_platform:'twitter',people_category:term,person_list:person(1).person_list});
 expect(mapped).not.toHaveProperty('bio');expect(mapped).not.toHaveProperty('media_details');expect(mapped).not.toHaveProperty('account');
});
it('completes more than1000 small advancing pages without a hidden request cardinality limit',async()=>{
 let n=0;read.mockImplementation(async()=>{n++;return page([person(n)],n<=1000?'cursor'+n:null)});
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false),{timeout:5000});
 expect(result.current.error).toBeNull();expect(result.current.data?.recommended_people).toHaveLength(1001);expect(result.current.data?.nextCursor).toBeNull();
});
it('fails closed before appending the page that crosses the64MiB sector aggregate budget',async()=>{
 let n=0;const note='n'.repeat(8192);read.mockImplementation(async()=>{n++;return page(Array.from({length:24},(_,i)=>({...person((n-1)*24+i+1),user_recommendation_note:note})),'cursor'+n)});
 const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false),{timeout:10000});
 expect(result.current.error).toEqual(Error('PUBLIC_PROFILE_READ_LIMIT'));expect(result.current.data).toBeUndefined();expect(n).toBeLessThan(400);
});
it('rejects empty non-final pages as lack of traversal progress and repeated cursor loops',async()=>{
 read.mockResolvedValueOnce(page([],'empty.next'));const {result}=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.error).toEqual(Error('PUBLIC_PROFILE_INVALID_RESPONSE'));expect(read).toHaveBeenCalledTimes(1);
 cleanup();read.mockReset();read.mockResolvedValueOnce(page([person(1)],'loop')).mockResolvedValueOnce(page([person(2)],'loop'));const second=renderHook(()=>usePublicPeopleSector('reader','sector',true));await waitFor(()=>expect(second.result.current.loading).toBe(false));expect(second.result.current.data).toBeUndefined();expect(second.result.current.error).toEqual(Error('PUBLIC_PROFILE_PAGINATION_LIMIT'));expect(read).toHaveBeenCalledTimes(2);
});
