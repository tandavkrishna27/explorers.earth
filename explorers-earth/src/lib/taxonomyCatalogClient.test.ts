import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {explorersApiClient} from './explorersApiClient';
import useAuthStore from '../store/store';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const item=(n:number)=>({id:id(n),category:'people',slug:`sector-${n}`,parentId:null,position:0,label:`Sector ${n}`,resolvedLocale:'en'});
const page=(items:unknown[],nextCursor:string|null=null)=>({version:'explorers-taxonomy-catalog/v1',category:'people',state:'CONFIGURED',catalogVersion:3,requestedLocale:null,defaultLocale:'en',items,nextCursor});
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
beforeEach(()=>{useAuthStore.getState().login({id:'u',documentId:'u',username:'owner',email:'owner@example.invalid',blocked:false,token:'fixture'});useAuthStore.setState({accountId:id(90)});});
afterEach(()=>{vi.unstubAllGlobals();useAuthStore.getState().logout();});
it('reads all pages including tied positions and the last term beyond 24',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(page(Array.from({length:24},(_,n)=>item(n+1)),'next'))).mockResolvedValueOnce(reply(page([item(25),item(26)])));
 vi.stubGlobal('fetch',fetcher);
 const result=await explorersApiClient.getCompleteTaxonomyCatalog({category:'people'});
 expect(result.items).toHaveLength(26);expect(result.items[25].id).toBe(id(26));expect(fetcher.mock.calls[1][0]).toContain('cursor=next');
});
it('preserves an explicit unconfigured catalog without invented options',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...page([]),state:'UNCONFIGURED',catalogVersion:0,defaultLocale:null})));
 expect(await explorersApiClient.getCompleteTaxonomyCatalog({category:'people'})).toMatchObject({state:'UNCONFIGURED',items:[]});
});
it('names an invalid catalog response so the picker can report a useful retry error',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(reply({...page([]),unknown:true})));
 await expect(explorersApiClient.getCompleteTaxonomyCatalog({category:'people'})).rejects.toThrow('Invalid taxonomy catalog response');
});
it.each(['version','duplicate','cursor','order','locale','category','unknown'])('rejects a %s invalid continuation without returning partial options',async kind=>{
 let second:any=page([item(2)]);
 if(kind==='version')second.catalogVersion=4;
 if(kind==='duplicate')second.items=[item(1)];
 if(kind==='cursor')second.nextCursor='next';
 if(kind==='order')second.items=[{...item(2),position:0,id:id(0)}];
 if(kind==='locale')second.requestedLocale='fr';
 if(kind==='category')second.category='places';
 if(kind==='unknown')second.unexpected=true;
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(reply(page([item(1)],'next'))).mockResolvedValueOnce(reply(second)));
 await expect(explorersApiClient.getCompleteTaxonomyCatalog({category:'people'})).rejects.toThrow();
});
it('surfaces catalog conflict so retry restarts from the first page',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(reply(page([item(1)],'next'))).mockResolvedValueOnce(reply({error:{code:'CONFLICT',message:'Catalog changed',requestId:'catalog-test'}},409)).mockResolvedValueOnce(reply(page([item(2)])));
 vi.stubGlobal('fetch',fetcher);await expect(explorersApiClient.getCompleteTaxonomyCatalog({category:'people'})).rejects.toMatchObject({status:409});
 expect((await explorersApiClient.getCompleteTaxonomyCatalog({category:'people'})).items).toEqual([item(2)]);expect(fetcher.mock.calls[2][0]).not.toContain('cursor=');
});
it.each(['abort','session'])('rejects %s change even when fetch ignores cancellation',async kind=>{
 let resolve!:(value:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
 const controller=new AbortController(),read=explorersApiClient.getCompleteTaxonomyCatalog({category:'people'},controller.signal);
 if(kind==='abort')controller.abort();else useAuthStore.getState().logout();
 resolve(reply(page([item(1)])));await expect(read).rejects.toMatchObject({name:'AbortError'});
});
