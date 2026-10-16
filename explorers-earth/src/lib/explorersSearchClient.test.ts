import {afterEach,expect,it,vi} from 'vitest';
import store from '../store/store';
import {explorersApiClient,assertCompleteMyCategoryContent} from './explorersApiClient';
const id='12345678-1234-4234-8234-123456789abc';
const page={version:'explorers-search/v1',scope:'public',consistency:'live',expiresAt:Date.now()+600000,nextCursor:null,items:[{id,title:null,kind:'book',userRating:null}]};
afterEach(()=>{vi.unstubAllGlobals();store.setState({accountId:null,isAuthenticated:false,generation:400});});
it('uses anonymous public transport and strict nullable DTOs without mutation authority',async()=>{
 vi.stubGlobal('fetch',async(url:string,init:RequestInit)=>{expect(url).toContain('/public/recommendations/search?');expect(init.credentials).toBe('omit');expect(init.cache).toBe('no-store');return new Response(JSON.stringify(page));});
 const result=await explorersApiClient.searchRecommendations({scope:'public',category:'books',entityIds:[id]});expect(result.items[0].title).toBeNull();expect(()=>assertCompleteMyCategoryContent(result as any)).toThrow();
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({...page,items:[{...page.items[0],accountId:id}]})));
 await expect(explorersApiClient.searchRecommendations({scope:'public',category:'books'})).rejects.toThrow();
});
it('cancels owner A to B to A generation changes and does not expire the new session on late401',async()=>{
 store.setState({accountId:id,isAuthenticated:true,generation:100});let release!:(v:Response)=>void,signal!:AbortSignal;
 vi.stubGlobal('fetch',(_url:string,init:RequestInit)=>{expect(init.credentials).toBe('include');signal=init.signal!;return new Promise<Response>(r=>{release=r;});});
 const pending=explorersApiClient.searchRecommendations({scope:'owner',category:'books'});
 store.setState({accountId:'22345678-1234-4234-8234-123456789abc',generation:101});store.setState({accountId:id,generation:102});expect(signal.aborted).toBe(true);
 release(new Response(JSON.stringify({error:{code:'UNAUTHENTICATED'}}),{status:401}));await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(store.getState().isAuthenticated).toBe(true);
});
it('rejects declared and streamed oversized responses and honors caller cancellation',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('{}',{headers:{'Content-Length':String(4*1024*1024+1)}}));await expect(explorersApiClient.searchRecommendations({scope:'public',category:'books'})).rejects.toMatchObject({status:413});
 vi.stubGlobal('fetch',async()=>new Response(' '.repeat(4*1024*1024+1)));await expect(explorersApiClient.searchRecommendations({scope:'public',category:'books'})).rejects.toMatchObject({status:413});
 const c=new AbortController();c.abort();await expect(explorersApiClient.searchRecommendations({scope:'public',category:'books'},c.signal)).rejects.toMatchObject({name:'AbortError'});
});
it('reads owner lean results without registering editable detail authority',async()=>{
 store.setState({accountId:id,isAuthenticated:true,generation:200});const item={...page.items[0],accountId:id,category:'books',entityId:id,entity:{id,kind:'book',title:'Canonical'},publicationState:'draft',revision:1};
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({version:'explorers-search/v1',scope:'owner',snapshot:'0',snapshotToken:'opaque',expiresAt:page.expiresAt,nextCursor:null,items:[item]})));
 const result=await explorersApiClient.searchRecommendations({scope:'owner',category:'books'});expect(result.items[0].title).toBeNull();
 await expect(explorersApiClient.updateMyRecommendation(result.items[0] as any,{userRating:8},'search-test-key')).rejects.toMatchObject({status:409});
});
