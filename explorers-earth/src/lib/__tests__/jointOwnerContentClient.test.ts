import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useAuthStore from '../../store/store';
import { explorersApiClient, assertCompleteMyCategoryContent, copyMyCategoryContentForStaging } from '../explorersApiClient';
const accountId='00000000-0000-4000-8000-000000000001';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n+10).padStart(12,'0')}`;
const collection=(n:number)=>({id:id(n),accountId,category:'books',title:`List ${n}`,slug:`list-${n}`,visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:n});
const child=(n:number)=>({id:id(n+2000),accountId,category:'books',entityId:id(9999),userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:n===52?{collectionId:id(26),position:0,revision:1}:null});
const membership=(n:number,c=26)=>({recommendationId:id(n+2000),collectionId:id(c),collectionRevision:1,displayOrder:n,collectionArchived:false,recommendationArchived:false});
const expiry=()=>Date.now()+600000;
let expiresAt:number;
const snapshot=()=>({version:'explorers-owner-content/v2',snapshotToken:'shared-token',revision:'7',expiresAt,pinRevision:1});
const page=(items:unknown[],nextCursor:string|null=null)=>({version:'explorers-owner-content/v2',snapshotToken:'shared-token',snapshot:'7',expiresAt,items,nextCursor});
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
type Hook=(stream:string,cursor:string|null,body:any,u:URL)=>Response|undefined|Promise<Response|undefined>;
function server(hook?:Hook,lists=27,children=53) {
  vi.stubGlobal('fetch',async(url:string)=>{
    const u=new URL(url,'http://localhost'),stream=u.pathname.split('/').at(-1)!,cursor=u.searchParams.get('cursor');
    if(stream!=='content-snapshot') expect(u.searchParams.get('snapshotToken')).toBe('shared-token');
    let body:any=snapshot();
    if(['collections','recommendations','memberships'].includes(stream)) {
      if(stream==='collections') expect(u.searchParams.get('status')).toBe('all');
      if(stream==='memberships') expect(u.searchParams.get('collectionStatus')).toBe('all');
      const offset=cursor?Number(cursor.split('-').at(-1)):0,total=stream==='collections'?lists:children;
      body=page(Array.from({length:Math.min(24,total-offset)},(_,n)=>stream==='collections'?collection(offset+n):stream==='recommendations'?child(offset+n):membership(offset+n)),offset+24<total?`${stream}-${offset+24}`:null);
    }
    return await hook?.(stream,cursor,body,u)??response(body);
  });
}
beforeEach(()=>{expiresAt=expiry();useAuthStore.setState({generation:10,accountId,isAuthenticated:true});});
afterEach(()=>vi.unstubAllGlobals());
it('joins 27 lists, 53 children and the late pin at one validated immutable revision',async()=>{
  server();const value=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
  expect(value.collections).toHaveLength(27);expect(value.recommendations).toHaveLength(53);expect(value.memberships).toHaveLength(53);
  expect(value.recommendations[52].pin?.collectionId).toBe(id(26));expect(value.revision).toBe('7');assertCompleteMyCategoryContent(value);
  expect(Object.isFrozen(value.recommendations[52].pin)).toBe(true);expect(Object.isFrozen(value.collections[0])).toBe(true);
  expect(()=>assertCompleteMyCategoryContent({...value})).toThrow();
  expect(()=>assertCompleteMyCategoryContent({complete:true,items:[]} as any)).toThrow();
});
it.each(['recommendations','validate'])('rejects a committed change before %s and grants no joint marker',async(stream)=>{
  server((s)=>s===stream?response({error:{code:'CONFLICT',message:'Changed'}},409):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({status:409});
});
it.each(['collections','recommendations','memberships'])('rejects %s page two failure and retries the entire snapshot',async(stream)=>{
  let failed=true;server((s,c)=>s===stream&&c&&failed?response({error:{code:'UNAVAILABLE'}},503):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({status:503});
  failed=false;expect((await explorersApiClient.getCompleteMyCategoryContent({category:'books'})).memberships).toHaveLength(53);
});
it.each(['snapshotToken','snapshot','expiresAt'])('rejects mismatched %s across streams',async(key)=>{
  server((s,_c,b)=>s==='recommendations'?response({...b,[key]:key==='expiresAt'?expiresAt+1:key==='snapshot'?'8':'other'}):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});
it.each(['duplicate','collection-duplicate','recommendation-duplicate','cursor','empty','parent','missing','missing-child','foreign','wrong-category','wrong-status','archived','pin','pin-negative-position','pin-foreign-target','pin-revision'])('rejects %s protocol corruption',async(kind)=>{
  server((s,c,b)=>{
    if(kind==='duplicate'&&s==='memberships'&&c) b.items[0]=membership(0);
    if(kind==='collection-duplicate'&&s==='collections'&&c) b.items[0]=collection(0);
    if(kind==='recommendation-duplicate'&&s==='recommendations'&&c) b.items[0]=child(0);
    if(kind==='foreign'&&s==='collections') b.items[0].accountId=id(888);
    if(kind==='wrong-category'&&s==='recommendations') b.items[0].category='games';
    if(kind==='wrong-status'&&s==='recommendations') b.items[0].archived=true;
    if(kind==='cursor'&&s==='recommendations'&&!c) b.nextCursor='collections-24';
    if(kind==='empty'&&s==='collections') b.items=[];
    if(s==='memberships'&&!c) {
      if(kind==='parent') b.items[0].collectionRevision=2;
      if(kind==='missing') b.items[0].collectionId=id(555);
      if(kind==='missing-child') b.items[0].recommendationId=id(555);
      if(kind==='archived') b.items[0].collectionArchived=true;
    }
    if(s==='recommendations'&&c==='recommendations-48') {
      if(kind==='pin') b.items[4].pin.collectionId=id(0);
      if(kind==='pin-negative-position') b.items[4].pin.position=-1;
      if(kind==='pin-foreign-target') b.items[4].pin.collectionId=id(555);
      if(kind==='pin-revision') b.items[4].pin.revision=2;
    }
    return response(b);
  });
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});
it.each(['revision','snapshotToken','expiresAt','pinRevision'])('rejects mismatched final validation %s',async(key)=>{
  server((s,_c,b)=>s==='validate'?response({...b,[key]:key==='revision'?'8':key==='snapshotToken'?'other':key==='expiresAt'?expiresAt+1:2}):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});
it('rejects an actual individual collector result as category writer authority',async()=>{
  vi.stubGlobal('fetch',async()=>response(page([collection(0)])));
  const individual=await explorersApiClient.getAllMyCollections({category:'books'});
  expect(()=>assertCompleteMyCategoryContent(individual as any)).toThrow();
});
it('invalidates completion and staging when the absolute snapshot expires',async()=>{
  server();const value=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
  const now=vi.spyOn(Date,'now').mockReturnValue(expiresAt);
  try {expect(()=>assertCompleteMyCategoryContent(value)).toThrow();expect(()=>copyMyCategoryContentForStaging(value)).toThrow();} finally {now.mockRestore();}
});
it('joins archived collection parents for active recommendations',async()=>{
  server((s,_c,b)=>{if(s==='collections') b.items.forEach((x:any)=>x.archived=true);if(s==='memberships') b.items.forEach((x:any)=>x.collectionArchived=true);if(s==='recommendations') b.items.forEach((x:any)=>x.pin=null);return response(b);});
  expect((await explorersApiClient.getCompleteMyCategoryContent({category:'books',status:'active'})).memberships[0].collectionArchived).toBe(true);
});
it('fails typed on transport, malformed data and expired snapshot',async()=>{
  vi.stubGlobal('fetch',async()=>{throw new TypeError('offline');});await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'UNAVAILABLE'});
  server(()=>response({bad:true}));await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
  expiresAt=Date.now()-1;server();await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'SNAPSHOT_EXPIRED'});
});
it('cancels pending reads and invalidates completed markers across A→B→A',async()=>{
  server();const complete=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
  let release!:(r:Response)=>void,signal!:AbortSignal;
  vi.stubGlobal('fetch',(_url:string,options:RequestInit)=>{signal=options.signal as AbortSignal;return new Promise<Response>(r=>release=r);});
  const pending=explorersApiClient.getCompleteMyCategoryContent({category:'books'});
  useAuthStore.setState({generation:11,accountId:id(888)});useAuthStore.setState({generation:12,accountId});expect(signal.aborted).toBe(true);
  release(response(snapshot()));await expect(pending).rejects.toMatchObject({name:'AbortError',code:'ABORTED'});expect(()=>assertCompleteMyCategoryContent(complete)).toThrow();
  const controller=new AbortController();controller.abort();await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'},controller.signal)).rejects.toMatchObject({code:'ABORTED'});
});
it('caps actual streamed page bytes even without a declared content length',async()=>{
  const chunk=new Uint8Array(1024*1024);let cancelled=false;
  vi.stubGlobal('fetch',async()=>new Response(new ReadableStream({pull(c){c.enqueue(chunk);},cancel(){cancelled=true;}})));
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'READ_BUDGET_EXCEEDED'});expect(cancelled).toBe(true);
});
it('caps the shared request budget across all streams',async()=>{
  let n=0;server((s)=>s==='collections'?response(page([collection(n++)],`next-${n}`)):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'READ_BUDGET_EXCEEDED'});expect(n).toBeLessThanOrEqual(999);
});
it('retains all 1001 memberships and a pin after membership page 41',async()=>{
  server((s,c,b)=>{
    if(s==='recommendations') b=page([{...child(0),pin:{collectionId:id(1000),position:0,revision:1}}]);
    if(s==='memberships') {const offset=c?Number(c.split('-').at(-1)):0;b=page(Array.from({length:Math.min(24,1001-offset)},(_,n)=>membership(0,offset+n)),offset+24<1001?`memberships-${offset+24}`:null);}
    return response(b);
  },1001,1);
  const value=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});expect(value.collections).toHaveLength(1001);expect(value.memberships).toHaveLength(1001);expect(value.recommendations[0].pin?.collectionId).toBe(id(1000));
});
it.each(['archived','all'] as const)('supports compatible %s recommendation/membership filters',async(status)=>{
  server((s,_c,b,u)=>{if(s==='recommendations') {expect(u.searchParams.get('status')).toBe(status);b.items.forEach((x:any)=>{x.archived=true;x.pin=null;});}if(s==='memberships') {expect(u.searchParams.get('recommendationStatus')).toBe(status);b.items.forEach((x:any)=>x.recommendationArchived=true);}return response(b);});
  expect((await explorersApiClient.getCompleteMyCategoryContent({category:'books',status})).recommendations[0].archived).toBe(true);
});
it('rejects more items than the requested page size',async()=>{
  server(s=>s==='collections'?response(page(Array.from({length:25},(_,n)=>collection(n)))):undefined,25,0);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});
it('stages explicit mutable copies without granting the draft a complete marker',async()=>{
  server();const value=await explorersApiClient.getCompleteMyCategoryContent({category:'books'}),draft=copyMyCategoryContentForStaging(value);
  draft.collections[0].title='Changed';draft.recommendations[52].pin!.position=9;draft.recommendations[0].mediaIds.push(id(800));draft.memberships[0].displayOrder=9;
  expect(value.collections[0].title).toBe('List 0');expect(value.recommendations[52].pin!.position).toBe(0);expect(value.recommendations[0].mediaIds).toEqual([]);expect(value.memberships[0].displayOrder).toBe(0);
  expect(()=>assertCompleteMyCategoryContent(draft as any)).toThrow();
});
it('caps the cumulative byte budget across individually legal pages',async()=>{
  let n=0;const description='x'.repeat(4*1024*1024-2000);
  server(s=>s==='collections'?response(page([{...collection(n++),description}],`big-${n}`)):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'READ_BUDGET_EXCEEDED'});expect(n).toBe(17);
});
it('rejects declared oversized body before reading it',async()=>{
  vi.stubGlobal('fetch',async()=>new Response('{}',{headers:{'Content-Length':'4194305'}}));
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({code:'READ_BUDGET_EXCEEDED'});
});
it('preserves definitive API errors and expires only the current session on 401',async()=>{
  server(s=>s==='recommendations'?response({error:{code:'UNAUTHENTICATED',message:'Expired'}},401):undefined);
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({status:401,code:'UNAUTHENTICATED'});
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it('expires the current session even when a definitive 401 body is malformed',async()=>{
  vi.stubGlobal('fetch',async()=>new Response('not-json',{status:401}));
  await expect(explorersApiClient.getCompleteMyCategoryContent({category:'books'})).rejects.toMatchObject({status:401,code:'UNAUTHENTICATED'});
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
});
it('preserves equal pin ranks in a complete immutable snapshot and mutable staging copy',async()=>{
  server((s,c,b)=>{if(s==='recommendations'&&c==='recommendations-48') b.items[3].pin={collectionId:id(26),position:0,revision:1};return response(b);});
  const value=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});assertCompleteMyCategoryContent(value);
  const pins=value.recommendations.filter(x=>x.pin);
  expect(pins.map(x=>x.id)).toEqual([id(2051),id(2052)]);expect(pins.map(x=>x.pin?.position)).toEqual([0,0]);
  expect(pins.every(x=>Object.isFrozen(x.pin))).toBe(true);
  const draft=copyMyCategoryContentForStaging(value);expect(draft.recommendations.filter(x=>x.pin).map(x=>x.pin?.position)).toEqual([0,0]);
  draft.recommendations[51].pin!.position=9;expect(value.recommendations[51].pin!.position).toBe(0);
  expect(()=>assertCompleteMyCategoryContent(draft as any)).toThrow();
});