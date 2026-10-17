import { describe, expect, it } from 'vitest';
import { createCategoryNavigationApi } from '../categoryNavigationApi';
import type { AccountDto } from '../../../../../tunes/shared/explorersContract';
export const origin = { userDocumentId: 'auth-user-17', accountDocumentId: '11111111-1111-4111-8111-111111111111', generation: 1 };
export function account(): AccountDto { return { id: origin.accountDocumentId, handle:null,displayName:'Owner',accountType:'Personal',onboardingStatus:'complete',status:'active',revision:7,publicProfile:true,autoPinning:false,locale:'en',mobileNumber:null,mobileNumberVisible:false,bioPlain:'untouched',bioRich:null,primaryAddress:null,additionalAddresses:[],publicAddress:null,profilePlaceDetails:null,categories:['places','music','guides','movies','books','games','apps','products','people'].map((category,i)=>({category:category as AccountDto['categories'][number]['category'],isPublic:i%2===0,displayOrder:i,pinnedOrder:category==='music'?2:category==='books'?0:null})),themeSettings:{},socialLinks:[],businessDetails:{},feedItems:[] }; }
function harness(reads: (AccountDto|Error)[], saved?:AccountDto|Error) {
 const writes:unknown[]=[]; let readCount=0; let legacyCount=0;
 const profile={getMyProfile:async()=>{readCount++;const next=reads.shift();if(next instanceof Error)throw next;return next!;},updateAccount:async(input:unknown)=>{writes.push(input);if(saved instanceof Error)throw saved;return saved!;}};
 const api=createCategoryNavigationApi({profile,client:{query:()=>{legacyCount++;throw Error('legacy GraphQL');}},isCurrent:()=>true} as never);
 return {api,writes,counts:()=>({readCount,legacyCount})};
}
describe('canonical navigation API',()=>{
 it('canonical_account_uuid_does_not_enter_legacy_user_query',async()=>{const h=harness([account()]);expect((await h.api.read(origin)).scope).toEqual({userDocumentId:'auth-user-17',accountDocumentId:origin.accountDocumentId});expect(h.counts()).toEqual({readCount:1,legacyCount:0});});
 it('uses fresh revision and preserves unrelated categories',async()=>{const fresh=account();fresh.revision=12; const saved=structuredClone(fresh);saved.revision=13;saved.categories[4].isPublic=false;const h=harness([fresh,saved],saved);expect((await h.api.commit(origin,{public_books:'No'})).revision).toBe(13);expect(h.writes).toEqual([{expectedRevision:12,categories:fresh.categories.map(row=>row.category==='books'?{...row,isPublic:false}:row)}]);});
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
 it('confirms every visibility field and exact pin order while preserving all nine rows',async()=>{
  const fresh=account();fresh.revision=12;
  const categories=fresh.categories.map(row=>({...row,isPublic:row.category==='books'?false:row.category==='games'?true:row.isPublic,pinnedOrder:row.category==='music'?0:row.category==='books'?1:null}));
  const saved={...fresh,revision:13,categories};const verified={...saved,revision:14};
  const h=harness([fresh,verified],saved);
  const result=await h.api.commit(origin,{public_books:'No',public_games:'Yes',pinned_nav_tabs:['public_profile','public_music','public_books']});
  expect(h.writes).toEqual([{expectedRevision:12,categories}]);
  expect(categories).toHaveLength(9);
  expect(categories.map(row=>row.displayOrder)).toEqual(fresh.categories.map(row=>row.displayOrder));
  expect(result).toMatchObject({revision:14,visibility:{public_books:'No',public_games:'Yes'},savedPins:['public_profile','public_music','public_books']});
  expect(h.counts()).toEqual({readCount:2,legacyCount:0});
 });
 it.each([
  ['response','pin order','uncertain'],['response','visibility','uncertain'],
  ['verification','pin order','conflict'],['verification','visibility','conflict'],
 ] as const)('rejects %s with mismatched %s for a multi-field patch',async(stage,field,kind)=>{
  const fresh=account();
  const saved={...fresh,revision:8,categories:fresh.categories.map(row=>({...row,isPublic:row.category==='books'?false:row.category==='games'?true:row.isPublic,pinnedOrder:row.category==='music'?0:row.category==='books'?1:null}))};
  const bad=structuredClone(saved);bad.revision=9;
  if(field==='pin order'){bad.categories[1].pinnedOrder=1;bad.categories[4].pinnedOrder=0;}
  else bad.categories[5].isPublic=false;
  const h=harness(stage==='response'?[fresh]:[fresh,bad],stage==='response'?bad:saved);
  await expect(h.api.commit(origin,{public_books:'No',public_games:'Yes',pinned_nav_tabs:['public_profile','public_music','public_books']})).rejects.toMatchObject({kind,...(kind==='conflict'?{snapshot:{revision:9}}:{})});
  expect(h.writes).toHaveLength(1);
  expect(h.counts()).toEqual({readCount:stage==='response'?1:2,legacyCount:0});
 });
});
