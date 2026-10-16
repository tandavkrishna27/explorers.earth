import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useAuthStore from '../../../store/store';
import { createCategoryNavigationApi } from '../categoryNavigationApi';
const accountId='11111111-1111-4111-8111-111111111111';
const scope={userDocumentId:'auth-owner',accountDocumentId:accountId,generation:1};
const collection=(category:string,n=1,extra={})=>({id:`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,accountId,category,title:'List',slug:`list-${n}`,visibility:'public',publicationState:'published',revision:1,description:null,heading:null,coverMediaId:null,archived:false,displayOrder:n,...extra});
const page=(items:unknown[],nextCursor:string|null=null)=>new Response(JSON.stringify({version:'explorers-owner-content/v2',snapshot:'1',snapshotToken:'opaque',expiresAt:Date.now()+600000,items,nextCursor}),{headers:{'Content-Type':'application/json'}});
beforeEach(()=>useAuthStore.setState({generation:10,accountId,isAuthenticated:true,user:{id:'auth-owner'} as never}));
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(['public_books','public_movie','public_games'] as const)('complete published native %s content enables publication',async(category)=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>page([collection(new URL(url,'http://localhost').searchParams.get('category')!)])));
 const api=createCategoryNavigationApi({isCurrent:()=>true});
 expect(await api.eligibility(category,scope)).toBe('allowed');
});

import { readCanonicalNavigationContent } from '../canonicalNavigationContent';
import { explorersApiClient } from '../../../lib/explorersApiClient';
it.each(['books','movies','games'])('counts only active public published %s collections across later pages',async(category)=>{
 const fetcher=vi.fn(async(url:string)=>{const u=new URL(url,'http://localhost'),cat=u.searchParams.get('category')!;expect(u.searchParams.get('status')).toBe('active');expect(u.searchParams.get('limit')).toBe('100');return cat!==category?page([]):u.searchParams.get('cursor')?page([collection(cat,5)]):page([collection(cat,1,{visibility:'private'}),collection(cat,2,{publicationState:'draft'}),collection(cat,4)],'later');});
 vi.stubGlobal('fetch',fetcher);
 const result=await readCanonicalNavigationContent(scope,()=>true);
 const field=category==='books'?'public_books':category==='movies'?'public_movie':'public_games';
 expect(result.counts[field]).toBe(2);expect(result.eligibility[field]).toBe('allowed');expect(fetcher).toHaveBeenCalledTimes(4);
});
it('complete empty sets establish no-content while unsupported categories and Music have no counts',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>page([])));
 expect(await readCanonicalNavigationContent(scope,()=>true)).toEqual({counts:{public_books:0,public_movie:0,public_games:0},eligibility:{public_books:'no-content',public_movie:'no-content',public_games:'no-content',public_recommendations:'unknown',public_guides:'unknown',public_apps:'unknown',public_products:'unknown',public_people:'unknown'}});
});
it.each(['failed','malformed','foreign','incomplete','wrong-category','archived'])('never certifies %s owner content as empty',async(kind)=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const cat=new URL(url,'http://localhost').searchParams.get('category')!;if(kind==='failed')throw Error('Unavailable');if(kind==='incomplete')return page([],'next');return page([collection(kind==='wrong-category'?'places':cat,1,kind==='archived'?{archived:true}:kind==='malformed'?{visibility:'invalid'}:kind==='foreign'?{accountId:'22222222-2222-4222-8222-222222222222'}:{})]);}));
 const result=await readCanonicalNavigationContent(scope,()=>true);expect(result.counts).toEqual({});expect(result.eligibility.public_books).toBe('unknown');expect(result.eligibility.public_movie).toBe('unknown');expect(result.eligibility.public_games).toBe('unknown');
});
it('rejects structurally fabricated complete sets without producer provenance',async()=>{
 vi.spyOn(explorersApiClient,'getAllMyCollections').mockResolvedValue({complete:true,items:[],snapshot:'1',accountId,generation:10});
 expect((await readCanonicalNavigationContent(scope,()=>true)).counts).toEqual({});
});
it.each(['caller','session','identity','abort'])('drops all counts when %s changes during a read',async(kind)=>{
 let current=true;const controller=new AbortController();
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{if(kind==='caller')current=false;if(kind==='session')useAuthStore.setState({generation:11});if(kind==='identity')useAuthStore.setState({user:{id:'foreign'} as never});if(kind==='abort')controller.abort();return page([collection(new URL(url,'http://localhost').searchParams.get('category')!)]);}));
 expect((await readCanonicalNavigationContent(scope,()=>current,controller.signal)).counts).toEqual({});
});
