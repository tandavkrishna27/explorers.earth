import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useAuthStore from '../../store/store';
import { explorersApiClient, assertCompleteOwnerContent } from '../explorersApiClient';
const accountId='00000000-0000-4000-8000-000000000001';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n+10).padStart(12,'0')}`;
const collection=(n:number)=>({id:id(n),accountId,category:'books',title:`List ${n}`,slug:`list-${n}`,visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:n});
const child=(n:number)=>({id:id(n+100),accountId,category:'books',entityId:id(999),userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:n===52?{collectionId:id(26),position:0,revision:1}:null});
const page=(items:any[],nextCursor:string|null,snapshot='1')=>({version:'explorers-owner-content/v2',snapshot,snapshotToken:'opaque-fixture',expiresAt:Date.now()+600000,items,nextCursor});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{useAuthStore.setState({generation:10,accountId,isAuthenticated:true});});
afterEach(()=>{vi.unstubAllGlobals();});
it('parses v2 compatibility pages for 27 lists and 53 bounded recommendation cores',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    const u=new URL(url,'http://localhost'),cursor=u.searchParams.get('cursor');
    if(u.pathname.endsWith('/collections')) return response(page(Array.from({length:cursor?3:24},(_,n)=>collection(n+(cursor?24:0))),cursor?null:'list-page2'));
    const offset=cursor==='child-page3'?48:cursor?24:0;return response(page(Array.from({length:offset===48?5:24},(_,n)=>child(n+offset)),offset===48?null:offset===24?'child-page3':'child-page2'));
  }));
  const lists=await explorersApiClient.getAllMyCollections({category:'books'});expect(lists.items).toHaveLength(27);assertCompleteOwnerContent(lists);
  const children=await explorersApiClient.getAllMyRecommendations({category:'books',collectionId:id(26)});expect(children.items).toHaveLength(53);expect(children.items[52].pin).toEqual({collectionId:id(26),position:0,revision:1});assertCompleteOwnerContent(children);
});
it('page two failure returns no complete set and a retry starts at the first page',async()=>{
  let failed=true;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const cursor=new URL(url,'http://localhost').searchParams.get('cursor');return cursor&&failed?response({error:{code:'UNAVAILABLE',message:'Retry'}},503):response(page(cursor?[collection(26)]:[collection(0)],cursor?null:'next'));}));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toMatchObject({status:503});
  expect(()=>assertCompleteOwnerContent(page([collection(0)],'next') as any)).toThrow();
  failed=false;const retried=await explorersApiClient.getAllMyCollections({category:'books'});expect(retried.items.map(x=>x.id)).toEqual([id(0),id(26)]);assertCompleteOwnerContent(retried);
});
it('rejects changed snapshots and duplicates instead of granting partial write eligibility',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const cursor=new URL(url,'http://localhost').searchParams.get('cursor');return response(page([collection(cursor?1:0)],cursor?null:'next',cursor?'2':'1'));}));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toMatchObject({status:409});
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const cursor=new URL(url,'http://localhost').searchParams.get('cursor');return response(page([collection(0)],cursor?null:'next'));}));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toThrow();
});
it('aborts in-flight reads on session generation/account changes and invalidates completed authority',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response(page([collection(0)],null))));
  const completed=await explorersApiClient.getAllMyCollections({category:'books'});
  let release!:(value:Response)=>void,signal:AbortSignal|undefined;
  vi.stubGlobal('fetch',vi.fn((_url:string,options:RequestInit)=>{signal=options.signal as AbortSignal;return new Promise<Response>(r=>{release=r;});}));
  const pending=explorersApiClient.getAllMyCollections({category:'books'});
  useAuthStore.setState({generation:11,accountId:id(999)});expect(signal?.aborted).toBe(true);
  release(response(page([collection(0)],null)));await expect(pending).rejects.toMatchObject({name:'AbortError'});
  expect(()=>assertCompleteOwnerContent(completed)).toThrow();
});
it('rejects foreign response context, malformed pages, and expired credentials',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response(page([{...collection(0),accountId:id(888)}],null))));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toThrow();
  vi.stubGlobal('fetch',vi.fn(async()=>response({items:[],nextCursor:null})));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toThrow();
  vi.stubGlobal('fetch',vi.fn(async()=>response({error:{code:'UNAUTHENTICATED',message:'Expired'}},401)));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toThrow();expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it('validates owner detail context and distinguishes pages from complete-set results',async()=>{
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>response(url.includes('/recommendations/')?{recommendation:child(0)}:{collection:collection(0)})));
  expect((await explorersApiClient.getMyCollection(id(0))).id).toBe(id(0));
  expect((await explorersApiClient.getMyRecommendation(id(100))).id).toBe(id(100));
  await expect(explorersApiClient.getMyCollection(id(1))).rejects.toMatchObject({status:409});
  await expect(explorersApiClient.getMyRecommendation(id(101))).rejects.toMatchObject({status:409});
  vi.stubGlobal('fetch',vi.fn(async()=>response(page([collection(0)],null))));
  const single=await explorersApiClient.getMyCollections({category:'books'});expect(()=>assertCompleteOwnerContent(single as any)).toThrow();
});
it('honors cancellation and rejects continued-empty or repeating-cursor pages',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>response(page([], 'next'))));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toMatchObject({status:409});
  let n=0;vi.stubGlobal('fetch',vi.fn(async()=>response(page([collection(n++)],'repeat'))));
  await expect(explorersApiClient.getAllMyCollections({category:'books'})).rejects.toMatchObject({status:409});
  const controller=new AbortController();controller.abort();
  await expect(explorersApiClient.getAllMyCollections({category:'books'},controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
