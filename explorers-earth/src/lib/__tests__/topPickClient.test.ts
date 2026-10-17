import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import useAuthStore from '../../store/store';
import {explorersApiClient,assertCompleteMyCategoryContent,copyMyCategoryContentForStaging} from '../explorersApiClient';
const accountId='00000000-0000-4000-8000-000000000001',collectionId='00000000-0000-4000-8000-000000000002',recommendationId='00000000-0000-4000-8000-000000000003';
let requests:{url:string;options:RequestInit}[],expiresAt:number;
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
const snapshot=()=>({version:'explorers-owner-content/v2',snapshotToken:'token',revision:'7',expiresAt,pinRevision:null});
function server(mutation?:(options:RequestInit)=>Response|Promise<Response>){
 vi.stubGlobal('fetch',async(url:string,options:RequestInit={})=>{requests.push({url,options});
 if(options.method==='PUT'||options.method==='PATCH') return mutation?.(options)??response({topPicks:{operation:options.method==='PUT'?'replace':'upsert-order',categoryRevision:'8',pinRevision:1,pins:[]}});
 if(url.includes('content-snapshot')) return response(snapshot());
 const path=new URL(url,'http://localhost').pathname;
 return response({version:'explorers-owner-content/v2',snapshotToken:'token',snapshot:'7',expiresAt,items:[],nextCursor:null,...(path.endsWith('top-picks')?{pinRevision:null}:{})});
 });
}
beforeEach(()=>{requests=[];expiresAt=Date.now()+600000;useAuthStore.setState({generation:10,accountId,isAuthenticated:true});});afterEach(()=>vi.unstubAllGlobals());
it.each(['setMyCategoryTopPicks','upsertMyCategoryTopPickOrder'] as const)('binds %s to private observed revisions and invalidates authority after success',async(method)=>{
 server();const observed=await explorersApiClient.getCompleteMyCategoryContent({category:'books'}),draft=copyMyCategoryContentForStaging(observed);
 expect(Object.isFrozen(observed)).toBe(true);expect(Object.isFrozen(draft)).toBe(false);
 const result=await explorersApiClient[method](observed,[], 'test-key-123');
 const request=requests.at(-1)!;expect(JSON.parse(request.options.body as string)).toEqual({orderedPins:[],expectedCategoryRevision:'7',expectedPinRevision:null});
 expect(result.operation).toBe(method==='setMyCategoryTopPicks'?'replace':'upsert-order');expect(()=>assertCompleteMyCategoryContent(observed)).toThrow();
});
it('rejects forged, filtered, expired and A to B to A observations before sending',async()=>{
 server();const observed=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
 await expect(explorersApiClient.setMyCategoryTopPicks({...observed},[],'test-key-123')).rejects.toMatchObject({status:409});
 const filtered=await explorersApiClient.getCompleteMyCategoryContent({category:'books',status:'archived'});
 await expect(explorersApiClient.setMyCategoryTopPicks(filtered,[],'test-key-123')).rejects.toMatchObject({status:409});
 useAuthStore.setState({generation:11,accountId:collectionId});useAuthStore.setState({generation:12,accountId});
 await expect(explorersApiClient.setMyCategoryTopPicks(observed,[],'test-key-123')).rejects.toMatchObject({status:409});expect(requests.some(r=>r.options.method)).toBe(false);
});
it('rejects candidate pins absent from observed memberships',async()=>{
 server(()=>response({topPicks:{operation:'upsert-order',categoryRevision:'8',pinRevision:1,pins:[{recommendationId,collectionId,position:0}]}}));
 const observed=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});
 await expect(explorersApiClient.upsertMyCategoryTopPickOrder(observed,[{recommendationId,collectionId}],'test-key-123')).rejects.toMatchObject({status:422});
 expect(()=>assertCompleteMyCategoryContent({...observed,revision:'8'})).toThrow();
});
it('offers strict bounded GET without granting joint authority',async()=>{
 server();const page=await explorersApiClient.getMyCategoryTopPicks({category:'books',limit:8});expect(page.items).toEqual([]);
 expect(()=>assertCompleteMyCategoryContent(page as any)).toThrow();expect(requests[0].url).toContain('/categories/books/top-picks?');
});
it('collects dedicated top-pick pages at the joint snapshot and validates after the last page',async()=>{
 server();const observed=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'});expect(observed.topPicks).toEqual([]);assertCompleteMyCategoryContent(observed);
 expect(requests.at(-2)!.url).toContain('/top-picks?');expect(requests.at(-1)!.url).toContain('/content-snapshot/validate?');
});
it('fails dedicated top-pick page two without granting an observation',async()=>{
 server();const original=fetch;vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{
 if(url.includes('/top-picks?')){if(url.includes('cursor='))return response({error:{code:'UNAVAILABLE'}},503);return response({version:'explorers-owner-content/v2',snapshotToken:'token',snapshot:'7',expiresAt,pinRevision:null,items:[{recommendationId,collectionId,position:0}],nextCursor:'next'});}
 return original(url,options);
 });await expect(explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'})).rejects.toMatchObject({status:503});
});
function pinnedServer(hook?:(url:URL,options:RequestInit,body:any)=>Response|undefined|Promise<Response|undefined>){
 const recId=(n:number)=>`00000000-0000-4000-8000-${String(n+100).padStart(12,'0')}`;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit={})=>{
 requests.push({url,options});const u=new URL(url,'http://localhost'),stream=u.pathname.split('/').at(-1),offset=u.searchParams.get('cursor')?24:0;
 let body:any={...snapshot(),pinRevision:1};
 const pins=Array.from({length:27},(_,n)=>({recommendationId:recId(n),collectionId,position:0}));
 if(options.method){const input=JSON.parse(options.body as string);body={topPicks:{operation:options.method==='PUT'?'replace':'upsert-order',categoryRevision:'8',pinRevision:2,pins:input.orderedPins.map((p:any,n:number)=>({...p,position:n}))}};}
 else if(stream==='collections')body={version:'explorers-owner-content/v2',snapshotToken:'token',snapshot:'7',expiresAt,items:[{id:collectionId,accountId,category:'books',title:'List',slug:'list',visibility:'private',publicationState:'draft',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0}],nextCursor:null};
 else if(['recommendations','memberships','top-picks'].includes(stream!)){
 const all=stream==='top-picks'?pins:stream==='memberships'?pins.map((p,n)=>({...p,position:undefined,collectionRevision:1,displayOrder:n,collectionArchived:false,recommendationArchived:false})):pins.map(p=>({id:p.recommendationId,accountId,category:'books',entityId:recommendationId,userRating:null,publicationState:'draft',revision:1,mediaIds:[],archived:false,pin:{collectionId,position:0,revision:1}}));
 body={version:'explorers-owner-content/v2',snapshotToken:'token',snapshot:'7',expiresAt,items:all.slice(offset,offset+24),nextCursor:offset===0?`${stream}-24`:null,...(stream==='top-picks'?{pinRevision:1}:{})};
 }return await hook?.(u,options,body)??response(body);
 });return recId;
}
it('collects 27 tied pins across page two and partial PATCH revokes the old union',async()=>{
 const id=pinnedServer(),observed=await explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'});expect(observed.topPicks).toHaveLength(27);
 const result=await explorersApiClient.upsertMyCategoryTopPickOrder(observed,[{recommendationId:id(26),collectionId}],'partial-key');expect(result.pins).toHaveLength(1);expect(observed.topPicks).toHaveLength(27);expect(()=>assertCompleteMyCategoryContent(observed)).toThrow();expect(()=>assertCompleteMyCategoryContent(result as any)).toThrow();
});
it.each(['snapshot','pinRevision','expiresAt'])('rejects dedicated GET %s change on page two',async(field)=>{
 pinnedServer((u,_o,b)=>u.pathname.endsWith('top-picks')&&u.searchParams.has('cursor')?response({...b,[field]:field==='snapshot'?'8':field==='pinRevision'?2:expiresAt+1}):undefined);
 await expect(explorersApiClient.getCompleteMyCategoryTopPicks({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});
it('expired original observation is rejected without a command',async()=>{
 server();const observed=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});vi.spyOn(Date,'now').mockReturnValue(expiresAt);try{await expect(explorersApiClient.setMyCategoryTopPicks(observed,[],'expired-key')).rejects.toMatchObject({status:409});expect(requests.some(r=>r.options.method)).toBe(false);}finally{vi.restoreAllMocks();}
});
it('keeps uncertain failure retry bound to original revisions and fences changed account during reply',async()=>{
 let fails=true;server(()=>{if(fails)throw new Error('network');return response({topPicks:{operation:'replace',categoryRevision:'8',pinRevision:1,pins:[]}});});
 const observed=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});await expect(explorersApiClient.setMyCategoryTopPicks(observed,[],'retry-key')).rejects.toMatchObject({status:503});assertCompleteMyCategoryContent(observed);fails=false;await explorersApiClient.setMyCategoryTopPicks(observed,[],'retry-key');expect(requests.filter(r=>r.options.method).map(r=>r.options.body)).toEqual([requests.at(-1)!.options.body,requests.at(-1)!.options.body]);
 server(()=>{useAuthStore.setState({generation:11,accountId:collectionId});useAuthStore.setState({generation:12,accountId});return response({topPicks:{operation:'replace',categoryRevision:'8',pinRevision:1,pins:[]}});});
 const next=await explorersApiClient.getCompleteMyCategoryContent({category:'books'});await expect(explorersApiClient.setMyCategoryTopPicks(next,[],'generation-key')).rejects.toMatchObject({status:409});
});

it('malformed dedicated GET uses a typed protocol failure',async()=>{
 server();const original=fetch;vi.stubGlobal('fetch',(url:string,options:RequestInit)=>url.includes('/top-picks?')?Promise.resolve(response({items:'wrong'})):original(url,options));
 await expect(explorersApiClient.getMyCategoryTopPicks({category:'books'})).rejects.toMatchObject({code:'INVALID_OWNER_CONTENT'});
});

it('dedicated complete top-pick inputs reject unsupported categories before any private read',async()=>{
 server();await expect(explorersApiClient.getCompleteMyCategoryTopPicks({category:'places'})).rejects.toMatchObject({status:422});expect(requests).toEqual([]);
});
