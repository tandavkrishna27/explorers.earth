import { describe,expect,it } from 'vitest';
import type { AccountDto } from '../../../../../tunes/shared/explorersContract';
export const origin = { userDocumentId: 'auth-user-17', accountDocumentId: '11111111-1111-4111-8111-111111111111', generation: 1 };
export function account(): AccountDto { return { id: origin.accountDocumentId, handle:null,displayName:'Owner',accountType:'Personal',onboardingStatus:'complete',status:'active',revision:7,publicProfile:true,autoPinning:false,locale:'en',mobileNumber:null,mobileNumberVisible:false,bioPlain:'untouched',bioRich:null,primaryAddress:null,additionalAddresses:[],publicAddress:null,profilePlaceDetails:null,categories:['places','music','guides','movies','books','games','apps','products','people'].map((category,i)=>({category:category as AccountDto['categories'][number]['category'],isPublic:i%2===0,displayOrder:i,pinnedOrder:category==='music'?2:category==='books'?0:null})),themeSettings:{},socialLinks:[],businessDetails:{},feedItems:[] }; }
import { toNavigationSnapshot,toNavigationAccountUpdate } from '../canonicalNavigationMapping';
describe('canonical preference mapping',()=>{
 it('maps all nine booleans and sorted pins with profile first',()=>{const snapshot=toNavigationSnapshot(account(),origin);expect(snapshot.visibility).toEqual({public_recommendations:'Yes',public_music:'No',public_guides:'Yes',public_movie:'No',public_books:'Yes',public_games:'No',public_apps:'Yes',public_products:'No',public_people:'Yes'});expect(snapshot.savedPins).toEqual(['public_profile','public_books','public_music']);expect(toNavigationAccountUpdate(snapshot,{public_music:'Yes'}).categories).toEqual(account().categories.map(row=>row.category==='music'?{...row,isPublic:true}:row));});
 it('translates explicit pin order and preserves display order',()=>{const snapshot=toNavigationSnapshot(account(),origin);const result=toNavigationAccountUpdate(snapshot,{pinned_nav_tabs:['public_profile','public_people','public_books']});expect(result.categories?.map(row=>row.pinnedOrder)).toEqual([null,null,null,null,1,null,null,null,0]);expect(result.categories?.map(row=>row.displayOrder)).toEqual([0,1,2,3,4,5,6,7,8]);});
 it.each(['missing','duplicate-category','duplicate-display','duplicate-pin','foreign','status'])('rejects %s without normalizing',kind=>{const dto=account();if(kind==='missing')dto.categories.pop();if(kind==='duplicate-category')dto.categories[8].category='books';if(kind==='duplicate-display')dto.categories[8].displayOrder=0;if(kind==='duplicate-pin')dto.categories[8].pinnedOrder=0;if(kind==='foreign')dto.id='22222222-2222-4222-8222-222222222222';if(kind==='status')dto.status='suspended';expect(()=>toNavigationSnapshot(dto,origin)).toThrow();});
 it('accepts an account whose server returns eight categories',()=>{
  // Break caught: P3-6 narrows the server to eight. A bundle that still demands
  // exactly nine rejects every account here and the navigation editor shows
  // "Category settings are incomplete" for everyone. This bundle must be live before P3-6.
  const dto=account();dto.categories=dto.categories.filter(row=>row.category!=='music').map((row,i)=>({...row,displayOrder:i,pinnedOrder:row.category==='books'?0:null}));
  const snapshot=toNavigationSnapshot(dto,origin);
  expect(snapshot.visibility.public_music).toBe('No');
  expect(snapshot.categories.map(row=>row.category)).not.toContain('music');
  expect(snapshot.savedPins).toEqual(['public_profile','public_books']);
  const update=toNavigationAccountUpdate(snapshot,{public_books:'No',pinned_nav_tabs:['public_profile','public_people']});
  expect(update.categories?.map(row=>row.category)).toEqual(['places','guides','movies','books','games','apps','products','people']);
  expect(update.categories?.find(row=>row.category==='books')).toMatchObject({isPublic:false,pinnedOrder:null});
  expect(update.categories?.find(row=>row.category==='people')?.pinnedOrder).toBe(0);
 });
 it('still accepts nine, while the server returns nine',()=>{
  // The same bundle runs against the pre-P3-6 server; the music row is echoed back untouched.
  const snapshot=toNavigationSnapshot(account(),origin);
  expect(snapshot.categories).toHaveLength(9);
  expect(toNavigationAccountUpdate(snapshot,{public_books:'No'}).categories?.find(row=>row.category==='music')).toEqual(account().categories.find(row=>row.category==='music'));
 });
 it('still requires every category other than music',()=>{const dto=account();dto.categories=dto.categories.filter(row=>row.category!=='guides');expect(()=>toNavigationSnapshot(dto,origin)).toThrow();});
 it.each([['public_books','public_profile'],['public_profile','public_books','public_books'],['public_profile','unknown']])('rejects invalid pin patch %s',pins=>{expect(()=>toNavigationAccountUpdate(toNavigationSnapshot(account(),origin),{pinned_nav_tabs:pins})).toThrow();});
});
