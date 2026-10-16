import {describe,it,expect} from 'vitest';
import {placePageCursor,mergePlacePage,completePlacesPreviews} from '../publicProfilePagination';
import {canContinuePublicTraversal} from '../usePublicPagedResource';
const page=(start:number,count:number,cursor:string|null,revision='7',id='list',total=30)=>({recommendationLists:[{documentId:id,slug:'synthetic',collection_revision:revision,eligibility_fingerprint:'a'.repeat(64),category_content_revision:'9',eligible_item_count:total,eligible_pin_count:Math.min(14,total),recommended_places:Array.from({length:count},(_,i)=>({documentId:`item-${start+i}`})),recommended_places_next_cursor:cursor}]});
describe('Places list continuation',()=>{
 it('keeps valid Places traversal past legacy offset bounds while retaining other-category defaults',()=>{
  expect(canContinuePublicTraversal(100008,true)).toBe(true);
  expect(canContinuePublicTraversal(100008)).toBe(false);
  expect(canContinuePublicTraversal(99999)).toBe(true);
  expect(canContinuePublicTraversal(Number.MAX_SAFE_INTEGER+1,true)).toBe(false);
 });
 it('carries actual cursor and coherent metadata across the pin boundary and terminal full page',()=>{
  const merged=mergePlacePage(page(0,12,'signed.first','7','list',24),page(12,12,null,'7','list',24),12);
  expect((merged.recommendationLists[0] as any).recommended_places).toHaveLength(24);
  expect(placePageCursor(merged)).toBeNull();
 });
 it('rejects legacy offsets and list or revision mixing',()=>{
  expect(()=>placePageCursor(page(0,12,'o12'))).toThrow();
  expect(()=>mergePlacePage(page(0,12,'signed'),page(12,12,null,'8'),12)).toThrow();
  expect(()=>mergePlacePage(page(0,12,'signed'),page(12,12,null,'7','other'),12)).toThrow();
  const changed=page(12,12,'signed.next');changed.recommendationLists[0].eligibility_fingerprint='b'.repeat(64);expect(()=>mergePlacePage(page(0,12,'signed'),changed,12)).toThrow('PUBLIC_PROFILE_409');
 });
 it('completes every preview through independently scoped child cursors beyond 24 items',async()=>{
  const calls:string[]=[];
  const complete=await completePlacesPreviews(page(0,12,'signed.first'),async(slug,cursor)=>{calls.push(`${slug}:${cursor}`);return cursor==='signed.first'?page(12,12,'signed.second'):page(24,6,null);},new AbortController().signal);
  expect(calls).toEqual(['synthetic:signed.first','synthetic:signed.second']);
  expect((complete.recommendationLists[0] as any).recommended_places.map((p:any)=>p.documentId)).toEqual(Array.from({length:30},(_,i)=>`item-${i}`));
 });
});
