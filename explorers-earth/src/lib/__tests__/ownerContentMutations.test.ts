import { beforeEach, expect, it, vi } from 'vitest';
import store from '../../store/store';
import { explorersApiClient } from '../explorersApiClient';
const account='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',entityId='00000000-0000-4000-8000-000000000003';
const collection={id,accountId:account,category:'books',title:'List',slug:'list',visibility:'private',publicationState:'draft',revision:4,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:0,pinOrder:null,categoryRevision:'9'};
const child={id,accountId:account,category:'books',entityId,userRating:null,publicationState:'draft',revision:2,mediaIds:[],archived:false,pin:null,note:null,categoryRevision:'9',entity:{id:entityId,kind:'book',title:'Canonical'},displayOverrides:{},displayTitle:'Canonical'};
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
beforeEach(()=>{vi.unstubAllGlobals();store.setState({accountId:account,isAuthenticated:true,generation:900});});
it('derives create identity/revision from privately issued parent and rejects copies/forged selectors',async()=>{
 let sent:any;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{if(!options.method)return response({collection});sent=JSON.parse(options.body as string);return response({recommendation:{...child,revision:1,archived:undefined,pin:undefined,note:undefined,categoryRevision:undefined,entity:undefined,displayOverrides:undefined,displayTitle:undefined}},201);});
 const observed=await explorersApiClient.getMyEditableCollection(id);
 expect(Object.isFrozen(observed.detail)).toBe(true);
 await expect(explorersApiClient.createMyRecommendation({...observed},{entityId},'stable-key')).rejects.toMatchObject({status:409});
 await expect(explorersApiClient.createMyRecommendation(observed,{entityId,expectedCollectionRevision:999} as any,'stable-key')).rejects.toMatchObject({status:422});
 await explorersApiClient.createMyRecommendation(observed,{entityId},'stable-key');
 expect(sent).toMatchObject({category:'books',collectionId:id,expectedCollectionRevision:4,entityId,note:null});
 await expect(explorersApiClient.createMyRecommendation(observed,{entityId},'new-key-1')).rejects.toMatchObject({status:409});
});
it('preserves caller note draft and stable key/body after uncertain transport, then consumes successful observation',async()=>{
 let lost=true;const attempts:any[]=[];
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{if(!options.method)return response({recommendation:child});attempts.push({body:options.body,key:new Headers(options.headers).get('Idempotency-Key')});if(lost){lost=false;throw new Error('reply lost');}return response({recommendation:{id,accountId:account,category:'books',entityId,userRating:3,publicationState:'draft',revision:3,mediaIds:[]}});});
 const observed=await explorersApiClient.getMyEditableRecommendation(id),draft={userRating:3,note:{version:1 as const,format:'quill-html' as const,html:'<p>😀 draft</p>'}};
 await expect(explorersApiClient.updateMyRecommendation(observed,draft,'retry-key')).rejects.toMatchObject({status:503});
 await explorersApiClient.updateMyRecommendation(observed,draft,'retry-key');
 expect(attempts[1]).toEqual(attempts[0]);expect(draft.note.html).toBe('<p>😀 draft</p>');
 await expect(explorersApiClient.updateMyRecommendation(observed,draft,'another-key')).rejects.toMatchObject({status:409});
});
it('fences late A to B to A completion and does not expire a newer session on old 401',async()=>{
 let release!:(x:Response)=>void;
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>options.method?new Promise<Response>(resolve=>{release=resolve;}):response({recommendation:child}));
 const observed=await explorersApiClient.getMyEditableRecommendation(id),pending=explorersApiClient.updateMyRecommendation(observed,{userRating:3},'late-key');
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));
 store.setState({accountId:entityId,generation:901});store.setState({accountId:account,generation:902,isAuthenticated:true});
 release(response({error:{code:'UNAUTHENTICATED',message:'Expired',requestId:'fixture'}},401));
 await expect(pending).rejects.toMatchObject({status:409});expect(store.getState().isAuthenticated).toBe(true);
});
it.each(['id','accountId','revision','category','entityId'])('rejects a successful mutation response with mismatched %s',async(field)=>{
 const dto={id,accountId:account,category:'books',entityId,userRating:3,publicationState:'draft',revision:3,mediaIds:[]};
 const forged={...dto,[field]:field==='revision'?99:field==='category'?'movies':'00000000-0000-4000-8000-000000000099'};
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>response(options.method?{recommendation:forged}:{recommendation:child}));
 const observed=await explorersApiClient.getMyEditableRecommendation(id);
 await expect(explorersApiClient.updateMyRecommendation(observed,{userRating:3},'forged-reply')).rejects.toMatchObject({status:503});
});
it('does not send a command after pre-abort, and copied staging data never grants authority',async()=>{
 let commands=0;vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{if(options.method)commands++;return response({recommendation:child});});
 const observed=await explorersApiClient.getMyEditableRecommendation(id),controller=new AbortController();controller.abort();
 await expect(explorersApiClient.updateMyRecommendation(observed,{note:null},'abort-key',controller.signal)).rejects.toMatchObject({status:409});expect(commands).toBe(0);
});
it('returns typed failure for malformed detail/error JSON and never sends forged patches',async()=>{
 let malformed=false;vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>options.method?response({error:'not typed'},409):response({recommendation:malformed?{...child,note:{version:1,format:'quill-html',html:'A',owner:'forged'}}:child}));
 const observed=await explorersApiClient.getMyEditableRecommendation(id);
 await expect(explorersApiClient.updateMyRecommendation(observed,{note:null,expectedRevision:999} as any,'forged-patch')).rejects.toMatchObject({status:422});
 await expect(explorersApiClient.updateMyRecommendation(observed,{note:null},'bad-error')).rejects.toMatchObject({status:503});
 malformed=true;await expect(explorersApiClient.getMyEditableRecommendation(id)).rejects.toMatchObject({status:503});
});
it('resolves manual titles with normalized stable retry and no fabricated owner observation',async()=>{
 let lost=true;const attempts:any[]=[];
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{attempts.push({body:options.body,key:new Headers(options.headers).get('Idempotency-Key')});if(lost){lost=false;throw new Error('reply lost');}return response({entity:{id:entityId,kind:'book',title:'😀 Manual'}});});
 const input={kind:'manual' as const,category:'books' as const,details:{title:'  😀 Manual  '}};
 await expect(explorersApiClient.resolveManualEntity(input,'manual-key')).rejects.toMatchObject({status:503});
 const result=await explorersApiClient.resolveManualEntity(input,'manual-key');expect(result).toEqual({id:entityId,kind:'book',title:'😀 Manual'});expect(Object.isFrozen(result)).toBe(true);expect(attempts[1]).toEqual(attempts[0]);expect(JSON.parse(attempts[0].body).details.title).toBe('😀 Manual');
 await expect(explorersApiClient.updateMyRecommendation(result as any,{displayOverrides:{title:'No authority'}},'bad-key-1')).rejects.toMatchObject({status:409});
 await expect(explorersApiClient.resolveManualEntity({...input,details:{title:'\ud800'}},'bad-key-1')).rejects.toMatchObject({status:422});expect(attempts).toHaveLength(2);
});
it('freezes sparse overrides, rejects inconsistent effective title and derives override mutation revision',async()=>{
 let malformed=false,sent:any;
 const detail={...child,displayOverrides:{title:null},displayTitle:null};
 vi.stubGlobal('fetch',async(_url:string,options:RequestInit)=>{if(!options.method)return response({recommendation:malformed?{...detail,displayTitle:'Canonical'}:detail});sent=JSON.parse(options.body as string);return response({recommendation:{id,accountId:account,category:'books',entityId,userRating:null,publicationState:'draft',revision:3,mediaIds:[]}});});
 const observed=await explorersApiClient.getMyEditableRecommendation(id);expect(Object.isFrozen(observed.detail.displayOverrides)).toBe(true);
 await explorersApiClient.updateMyRecommendation(observed,{displayOverrides:{title:'  Mine  '}},'override-key');expect(sent).toMatchObject({expectedRevision:2,displayOverrides:{title:'Mine'}});
 malformed=true;await expect(explorersApiClient.getMyEditableRecommendation(id)).rejects.toMatchObject({status:503});
});
it.each(['null-canonical','foreign-entity','kind','unknown-override','missing-effective'])('rejects malformed editable catalog presentation %s',async(kind)=>{
 const malformed=structuredClone(child) as any;
 if(kind==='null-canonical')malformed.entity.title=null;
 if(kind==='foreign-entity')malformed.entity.id=id;
 if(kind==='kind')malformed.entity.kind='movie';
 if(kind==='unknown-override')malformed.displayOverrides={facts:{}};
 if(kind==='missing-effective')delete malformed.displayTitle;
 vi.stubGlobal('fetch',async()=>response({recommendation:malformed}));await expect(explorersApiClient.getMyEditableRecommendation(id)).rejects.toMatchObject({status:503});
});
