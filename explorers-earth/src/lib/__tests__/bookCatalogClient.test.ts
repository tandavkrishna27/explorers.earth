import {beforeEach,expect,it,vi} from 'vitest';
import store from '../../store/store';
import {explorersApiClient} from '../explorersApiClient';
import {emptyBookDetails} from '../../../../tunes/shared/explorersBookContract';
const account='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',entityId='00000000-0000-4000-8000-000000000003',nextId='00000000-0000-4000-8000-000000000004';
const child={id,accountId:account,category:'books',entityId,userRating:null,publicationState:'draft',revision:2,mediaIds:[],archived:false,pin:null,note:null,categoryRevision:'9',entity:{id:entityId,kind:'book',title:'Canonical',origin:'manual',details:emptyBookDetails(),provenance:null},displayOverrides:{},displayTitle:'Canonical',bookContext:{buyLinks:[]},effectiveBookDetails:emptyBookDetails()};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
beforeEach(()=>{vi.unstubAllGlobals();store.setState({accountId:account,isAuthenticated:true,generation:900});});
it('requires issued observation for replacement, derives expected revision and consumes success',async()=>{
 expect(explorersApiClient.replaceRecommendationEntity).toBeTypeOf('function');let sent:any;
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{if(!options.method)return response({recommendation:child});sent=JSON.parse(options.body as string);return response({recommendation:{id,accountId:account,category:'books',entityId:nextId,userRating:null,publicationState:'draft',revision:3,mediaIds:[]}});});
 const observation=await explorersApiClient.getMyEditableRecommendation(id);
 await expect(explorersApiClient.replaceRecommendationEntity({...observation},nextId,'replace-key')).rejects.toMatchObject({status:409});
 await explorersApiClient.replaceRecommendationEntity(observation,nextId,'replace-key');expect(sent).toEqual({expectedRevision:2,entityId:nextId});
 await expect(explorersApiClient.replaceRecommendationEntity(observation,entityId,'repeat-key')).rejects.toMatchObject({status:409});
});
it('candidate completion is fenced through account generation and creates no category authority',async()=>{
 expect(explorersApiClient.searchBookCandidates).toBeTypeOf('function');let release!:(x:Response)=>void;
 vi.stubGlobal('fetch',()=>new Promise<Response>(r=>release=r));const pending=explorersApiClient.searchBookCandidates({query:'book'});
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));store.setState({generation:901});release(response({version:'explorers-book-candidates/v1',items:[],nextCursor:null,expiresAt:Date.now()+1000}));await expect(pending).rejects.toBeDefined();
});
it('imports covers only through issued recommendation observation and validates receipt authority',async()=>{
 expect(explorersApiClient.importBookCovers).toBeTypeOf('function');let sent:any;
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{if(!options.method)return response({recommendation:child});sent=JSON.parse(options.body as string);return response({coverImport:{id,revision:3,slots:{cover:{status:'fallback'},thumbnail:{status:'fallback'}}}});});
 const observed=await explorersApiClient.getMyEditableRecommendation(id);await expect(explorersApiClient.importBookCovers({...observed},'cover-key')).rejects.toMatchObject({status:409});const result=await explorersApiClient.importBookCovers(observed,'cover-key');expect(sent).toEqual({expectedRevision:2});expect(result.revision).toBe(3);await expect(explorersApiClient.importBookCovers(observed,'cover-key-two')).rejects.toMatchObject({status:409});
});

it('rejects malformed provider errors, oversized candidate responses and forged fields before sending',async()=>{
 vi.stubGlobal('fetch',async()=>response({error:{code:'UNREVIEWED',message:'raw upstream',requestId:'test'}},503));await expect(explorersApiClient.searchBookCandidates({query:'book'})).rejects.toMatchObject({status:503,code:'INVALID_OWNER_CONTENT'});
 const fetch=vi.fn(async()=>new Response('x'.repeat(4*1024*1024+1)));vi.stubGlobal('fetch',fetch);await expect(explorersApiClient.searchBookCandidates({query:'book'})).rejects.toMatchObject({status:413});
 await expect(explorersApiClient.searchBookCandidates({query:'book',accountId:account} as any)).rejects.toMatchObject({status:422});expect(fetch).toHaveBeenCalledTimes(1);
});
