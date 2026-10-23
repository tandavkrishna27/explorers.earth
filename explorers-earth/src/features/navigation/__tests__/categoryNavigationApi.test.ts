import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { explorersApiClient } from '../../../lib/explorersApiClient';
import useAuthStore from '../../../store/store';
import { canonicalAccountQuery } from '../../Profile/api/useCanonicalAccount';
import { createCategoryNavigationApi } from '../categoryNavigationApi';
import type { AccountDto } from '../../../../../tunes/shared/explorersContract';
export const origin = { userDocumentId: 'auth-user-17', accountDocumentId: '11111111-1111-4111-8111-111111111111', generation: 1 };
export function account(): AccountDto { return { id: origin.accountDocumentId, handle:null,displayName:'Owner',accountType:'Personal',onboardingStatus:'complete',status:'active',revision:7,publicProfile:true,autoPinning:false,locale:'en',mobileNumber:null,mobileNumberVisible:false,bioPlain:'untouched',bioRich:null,primaryAddress:null,additionalAddresses:[],publicAddress:null,profilePlaceDetails:null,categories:['places','guides','movies','books','games','apps','products','people'].map((category,i)=>({category:category as AccountDto['categories'][number]['category'],isPublic:['places','guides','books','apps','people'].includes(category),displayOrder:i,pinnedOrder:category==='guides'?2:category==='books'?0:null})),themeSettings:{},socialLinks:[],businessDetails:{},feedItems:[] }; }
function harness(reads: (AccountDto|Error)[], saved?:AccountDto|Error) {
 const writes:unknown[]=[]; let readCount=0; let legacyCount=0;
 const profile={getMyProfile:async()=>{readCount++;const next=reads.shift();if(next instanceof Error)throw next;return next!;},updateAccount:async(input:unknown)=>{writes.push(input);if(saved instanceof Error)throw saved;return saved!;}};
 const api=createCategoryNavigationApi({profile,client:{query:()=>{legacyCount++;throw Error('legacy GraphQL');}},isCurrent:()=>true} as never);
 return {api,writes,counts:()=>({readCount,legacyCount})};
}
describe('canonical navigation API',()=>{
 it('canonical_account_uuid_does_not_enter_legacy_user_query',async()=>{const h=harness([account()]);expect((await h.api.read(origin)).scope).toEqual({userDocumentId:'auth-user-17',accountDocumentId:origin.accountDocumentId});expect(h.counts()).toEqual({readCount:1,legacyCount:0});});
 it('uses fresh revision and preserves unrelated categories',async()=>{const fresh=account();fresh.revision=12; const saved=structuredClone(fresh);saved.revision=13;saved.categories[3].isPublic=false;const h=harness([fresh,saved],saved);expect((await h.api.commit(origin,{public_books:'No'})).revision).toBe(13);expect(h.writes).toEqual([{expectedRevision:12,categories:fresh.categories.map(row=>row.category==='books'?{...row,isPublic:false}:row)}]);});
 it('auto-only writes omit categories and unrelated profile fields',async()=>{const fresh=account();const saved={...fresh,revision:8,autoPinning:true};const h=harness([fresh,saved],saved);await h.api.commit(origin,{auto_pinning:true});expect(h.writes).toEqual([{expectedRevision:7,autoPinning:true}]);});
 it('surfaces revision conflict with fresh snapshot without retrying write',async()=>{const fresh=account();const latest={...fresh,revision:9};const h=harness([fresh,latest],Object.assign(new Error('conflict'),{status:409}));await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toMatchObject({kind:'conflict',snapshot:{revision:9}});expect(h.writes).toHaveLength(1);});
 it.each(['foreign','suspended','malformed'])('never confirms %s response',async(kind)=>{const fresh=account();const bad={...fresh,autoPinning:true};if(kind==='foreign')bad.id='22222222-2222-4222-8222-222222222222';if(kind==='suspended')bad.status='suspended';if(kind==='malformed')bad.revision=0;const h=harness([fresh],bad);await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toBeDefined();expect(h.writes).toHaveLength(1);});
 it('lost response never retries admitted write',async()=>{const h=harness([account()],new Error('lost'));await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toMatchObject({kind:'uncertain'});expect(h.writes).toHaveLength(1);});
 it.each(['foreign','suspended'])('denies %s account before writing',async(kind)=>{const dto=account();if(kind==='foreign')dto.id='22222222-2222-4222-8222-222222222222';else dto.status='suspended';const h=harness([dto]);await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toMatchObject({kind:'blocked'});expect(h.writes).toHaveLength(0);});
 it('fresh contradictory verification reports conflict',async()=>{const fresh=account();const h=harness([fresh,fresh],{...fresh,autoPinning:true,revision:8});await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toMatchObject({kind:'conflict'});});
 it.each(['network failure','malformed DTO'])('never confirms a successful write followed by %s verification',async(kind)=>{
  const fresh=account();const saved={...fresh,revision:8,autoPinning:true};
  const verification=kind==='network failure'?new Error('verification read failed'):{...saved,revision:0};
  const h=harness([fresh,verification],saved);
  await expect(h.api.commit(origin,{auto_pinning:true})).rejects.toMatchObject({kind:'uncertain'});
  expect(h.writes).toEqual([{expectedRevision:7,autoPinning:true}]);
  expect(h.counts()).toEqual({readCount:2,legacyCount:0});
 });
 it('confirms every visibility field and exact pin order while preserving all eight rows',async()=>{
  const fresh=account();fresh.revision=12;
  const categories=fresh.categories.map(row=>({...row,isPublic:row.category==='books'?false:row.category==='games'?true:row.isPublic,pinnedOrder:row.category==='guides'?0:row.category==='books'?1:null}));
  const saved={...fresh,revision:13,categories};const verified={...saved,revision:14};
  const h=harness([fresh,verified],saved);
  const result=await h.api.commit(origin,{public_books:'No',public_games:'Yes',pinned_nav_tabs:['public_profile','public_guides','public_books']});
  expect(h.writes).toEqual([{expectedRevision:12,categories}]);
  expect(categories).toHaveLength(8);
  expect(categories.map(row=>row.displayOrder)).toEqual(fresh.categories.map(row=>row.displayOrder));
  expect(result).toMatchObject({revision:14,visibility:{public_books:'No',public_games:'Yes'},savedPins:['public_profile','public_guides','public_books']});
  expect(h.counts()).toEqual({readCount:2,legacyCount:0});
 });
 it.each([
  ['response','pin order','uncertain'],['response','visibility','uncertain'],
  ['verification','pin order','conflict'],['verification','visibility','conflict'],
 ] as const)('rejects %s with mismatched %s for a multi-field patch',async(stage,field,kind)=>{
  const fresh=account();
  const saved={...fresh,revision:8,categories:fresh.categories.map(row=>({...row,isPublic:row.category==='books'?false:row.category==='games'?true:row.isPublic,pinnedOrder:row.category==='guides'?0:row.category==='books'?1:null}))};
  const bad=structuredClone(saved);bad.revision=9;
  if(field==='pin order'){bad.categories[1].pinnedOrder=1;bad.categories[3].pinnedOrder=0;}
  else bad.categories[4].isPublic=false;
  const h=harness(stage==='response'?[fresh]:[fresh,bad],stage==='response'?bad:saved);
  await expect(h.api.commit(origin,{public_books:'No',public_games:'Yes',pinned_nav_tabs:['public_profile','public_guides','public_books']})).rejects.toMatchObject({kind,...(kind==='conflict'?{snapshot:{revision:9}}:{})});
  expect(h.writes).toHaveLength(1);
  expect(h.counts()).toEqual({readCount:stage==='response'?1:2,legacyCount:0});
 });
});
describe('canonical navigation account through the shared query',()=>{
 afterEach(()=>{vi.restoreAllMocks();});
 const accounts=(client:QueryClient)=>({client,identity:()=>({identityKey:'auth-user-17',generation:useAuthStore.getState().generation})});
 it('reads the account the page already loaded without another /me',async()=>{
  const getMyProfile=vi.spyOn(explorersApiClient,'getMyProfile').mockResolvedValue(account());
  const client=new QueryClient();
  await client.fetchQuery(canonicalAccountQuery('auth-user-17',useAuthStore.getState().generation));
  const api=createCategoryNavigationApi({isCurrent:()=>true,accounts:accounts(client)});
  expect((await api.readAccount(origin)).revision).toBe(7);
  expect(getMyProfile).toHaveBeenCalledTimes(1);
 });
 it('a save still composes against a fresh read and refreshes the shared account',async()=>{
  const fresh=account();fresh.revision=12;const saved={...fresh,revision:13,autoPinning:true};
  const getMyProfile=vi.spyOn(explorersApiClient,'getMyProfile').mockResolvedValueOnce(account()).mockResolvedValueOnce(fresh).mockResolvedValueOnce(saved);
  const client=new QueryClient();
  const key=canonicalAccountQuery('auth-user-17',useAuthStore.getState().generation).queryKey;
  await client.fetchQuery(canonicalAccountQuery('auth-user-17',useAuthStore.getState().generation));
  const writes:unknown[]=[];
  const api=createCategoryNavigationApi({isCurrent:()=>true,accounts:accounts(client),profile:{getMyProfile,updateAccount:async(input)=>{writes.push(input);return saved;}}});
  expect((await api.commit(origin,{auto_pinning:true})).revision).toBe(13);
  expect(writes).toEqual([{expectedRevision:12,autoPinning:true}]);
  expect(client.getQueryData<AccountDto>(key)?.revision).toBe(13);
 });
 it('a failed save read stays out of the shared account so page observers keep their data',async()=>{
  const getMyProfile=vi.spyOn(explorersApiClient,'getMyProfile').mockResolvedValueOnce(account()).mockRejectedValueOnce(Error('offline'));
  const client=new QueryClient();
  const query=canonicalAccountQuery('auth-user-17',useAuthStore.getState().generation);
  await client.fetchQuery(query);
  const api=createCategoryNavigationApi({isCurrent:()=>true,accounts:accounts(client),profile:{getMyProfile,updateAccount:async()=>{throw Error('no write expected');}}});
  await expect(api.commit(origin,{auto_pinning:true})).rejects.toBeTruthy();
  expect(client.getQueryState(query.queryKey)?.status).toBe('success');
  expect(client.getQueryData<AccountDto>(query.queryKey)?.revision).toBe(7);
 });
});
