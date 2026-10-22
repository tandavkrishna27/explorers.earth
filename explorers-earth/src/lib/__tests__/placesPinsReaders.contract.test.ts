import {describe,it,expect,vi} from 'vitest';
vi.mock('../../../../tunes/server/application/authorization',()=>({authorizeOperation:vi.fn()}));
import {OwnerContentService} from '../../../../tunes/server/application/ownerContent';
import {PublicContentService,PublicContentFailure} from '../../../../tunes/server/application/publicContent';
import {SqlStatementRecorder,isTransactionControl} from '../../../../tunes/server/test/helpers/sqlStatementRecorder';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',collection='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=(n:number)=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
const mediaId=(n:number)=>`dddddddd-dddd-4ddd-8ddd-${String(n).padStart(12,'0')}`;
/**
 * Statements keyed on STABLE STRUCTURE only - FROM/JOIN/WHERE fragments and the
 * `/* marker *\/` comments production already carries - never on a SELECT list.
 *
 * This fixture previously keyed the owner row read on the SELECT-list prefix
 * `SELECT r.id,` and had no key at all for the two reads that
 * `OwnerContentService.recommendations()` issues after it: the lateral
 * recommendation_media read and the category_recommendation_pins read. Both fell
 * through to a silent `{rows:[]}`, so every owner DTO these tests produced carried
 * `mediaIds:[]` and `pin:null` no matter what, and the `mediaIds.length>20` 413 bound
 * could never fire. The recorder below makes that failure mode loud: an unkeyed
 * projection is recorded as a vacuity finding, and `assertExercised` additionally
 * requires that the named keys actually served rows.
 */
const RULES={
 // OwnerContentService.snapshot(): the only read that touches account_category_pin_state
 // with the account/category pair directly in its WHERE.
 ownerSnapshotState:(s:string)=>s.includes('FROM account_category_pin_state WHERE account_id=$1 AND category=$2'),
 // PublicContentService.page(): the category content revision on its own.
 publicCategoryState:(s:string)=>s.includes('FROM account_category_content_state WHERE account_id=$1 AND category=$2')&&!s.includes('account_category_pin_state'),
 ownerCollectionParent:(s:string)=>s.includes('FROM collections WHERE id=$1 AND account_id=$2 AND category=$3'),
 publicCollectionBySlug:(s:string)=>s.includes('FROM collections c WHERE c.account_id=$1 AND c.category=$2 AND (c.slug=$3 OR'),
 publicAccountScope:(s:string)=>s.includes('FROM creator_accounts a JOIN account_category_settings s')&&s.includes('a.handle_key=$1'),
 publicEligibilityAggregate:(s:string)=>s.includes('/* public_places_eligibility_aggregate */'),
 publicCurrentList:(s:string)=>s.includes('/* public_places_current_list */'),
 publicCurrentEligibility:(s:string)=>s.includes('/* public_places_current_eligibility */'),
 // listRecommendations() Places eligibility counts: scanned FROM recommendations r,
 // which is what separates it from the public aggregate that only JOINs that table.
 ownerPlaceCounts:(s:string)=>s.includes('AS item_count')&&s.includes('FROM recommendations r '),
 ownerRecommendationRows:(s:string)=>s.includes('FROM recommendations r ')&&s.includes('AS page_order'),
 publicPlaceRows:(s:string)=>s.includes('FROM collection_items ci')&&s.includes('collection_place_pins pp')&&s.includes('AS pin_bucket'),
 publicCollectionRows:(s:string)=>s.includes('FROM collection_items ci')&&!s.includes('collection_place_pins'),
 // ownerContent.ts:103 - the lateral media read that had no key.
 ownerMediaLateral:(s:string)=>s.includes('FROM recommendation_media WHERE recommendation_id=parent.id'),
 // ownerContent.ts:104 - the category pin read that had no key.
 ownerCategoryPins:(s:string)=>s.includes('FROM category_recommendation_pins p JOIN account_category_pin_state s'),
 ownerMemberships:(s:string)=>s.includes('FROM collection_items i JOIN collections c'),
};
function fixture(category='places'){
 let collectionRevision=4,categoryRevision='9',lane='0',membershipPosition:string|null='3',committed=false,countRace=false,mediaPerItem=2;
 const pinnedIndexes=new Set([0,17]);
 const all=Array.from({length:30},(_,n)=>({id:id(n),account_id:account,entity_id:id(n),category,content_category:category,user_rating:null,publication_state:n===0?'draft':'published',revision:1,archived_at:null,page_order:category==='places'?String(n<14?n:0):n<14?n:0,display_order:category==='places'?String(n<14?n:0):n<14?n:0,pin_bucket:n<14?0:1,canonical_title:'Synthetic',display_values:{},title_bytes:10,override_schema_version:null,kind:category==='places'?'place':'book'}));
 const indexOf=(value:string)=>all.findIndex(row=>row.id===value);
 const recorder=new SqlStatementRecorder(RULES,sql=>!isTransactionControl(sql));
 const seek=(values:any[])=>values.length===7?{bucket:values[3] as number|null,position:values[4] as number,last:values[5] as string}:{bucket:null,position:0,last:''};
 const query=vi.fn(async(sql:string,values:any[]=[])=>{
  if(isTransactionControl(sql)){if(/^\s*COMMIT/i.test(sql))committed=true;return {rows:[]};}
  const kind=recorder.kind(sql);
  switch(kind){
   case 'ownerSnapshotState':return {rows:recorder.serve(kind,[{revision:categoryRevision,pin_revision:'3'}])};
   case 'publicCategoryState':return {rows:recorder.serve(kind,[{revision:categoryRevision}])};
   case 'ownerCollectionParent':return {rows:recorder.serve(kind,[{id:collection,revision:String(collectionRevision)}])};
   case 'publicCollectionBySlug':return {rows:recorder.serve(kind,values[2]==='synthetic'?[{id:collection,revision:String(collectionRevision)}]:[])};
   case 'publicAccountScope':return {rows:recorder.serve(kind,[{id:account}])};
   case 'publicCurrentList':return {rows:recorder.serve(kind,[{id:collection,collection_revision:String(collectionRevision),category_revision:categoryRevision}])};
   case 'publicCurrentEligibility':return {rows:recorder.serve(kind,(values[1]??[]).map((row:string,n:number)=>({id:row,entity_id:values[2][n],collection_id:values[3][n]})))};
   case 'publicEligibilityAggregate':
    // The public scope excludes the single draft row and its pin.
    return {rows:recorder.serve(kind,[{item_count:countRace&&committed?'28':'29',pin_count:'13',lane_0:lane,lane_1:'0',lane_2:'0',lane_3:'0'}])};
   case 'ownerPlaceCounts':
    expect(sql).toContain('collection_place_pins');
    return {rows:recorder.serve(kind,[{item_count:'30',pin_count:'14'}])};
   case 'ownerRecommendationRows':{
    const {bucket,position,last}=seek(values);
    expect(sql).not.toContain("r.publication_state='published'");
    if(category==='places'){expect(sql).toContain('collection_place_pins');expect(sql).toContain('ORDER BY CASE WHEN pp.recommendation_id IS NULL THEN 1 ELSE 0 END,coalesce(pp.position,');}
    const rows=all.filter(row=>bucket==null||row.pin_bucket>bucket||row.pin_bucket===bucket&&(Number(row.page_order)>position||Number(row.page_order)===position&&row.id>last));
    return {rows:recorder.serve(kind,rows.slice(0,values.at(-1)))};
   }
   case 'publicPlaceRows':{
    const {bucket,position,last}=seek(values);
    expect(sql).toContain("r.publication_state='published'");
    expect(sql).toContain('ORDER BY CASE WHEN pp.recommendation_id IS NULL THEN 1 ELSE 0 END,coalesce(pp.position,');
    const rows=all.filter(row=>row.publication_state==='published'&&(bucket==null||row.pin_bucket>bucket||row.pin_bucket===bucket&&(Number(row.page_order)>position||Number(row.page_order)===position&&row.id>last)));
    return {rows:recorder.serve(kind,rows.slice(0,values.at(-1)))};
   }
   case 'publicCollectionRows':{
    expect(sql).toContain("r.publication_state='published'");
    expect(sql).not.toContain('collection_place_pins');
    const rows=all.filter(row=>row.publication_state==='published');
    return {rows:recorder.serve(kind,rows.slice(0,values.at(-1)))};
   }
   case 'ownerMediaLateral':{
    // ownerContent.ts:103 selects parent.id and m.media_id, LIMIT 21 per parent, so a
    // 21-row parent is representable and is exactly what trips the 413 media bound.
    const rows=(values[0] as string[]).flatMap(parent=>Array.from({length:mediaPerItem},(_,slot)=>({id:parent,media_id:mediaId(indexOf(parent)*32+slot)})));
    return {rows:recorder.serve(kind,rows)};
   }
   case 'ownerCategoryPins':{
    const rows=(values[0] as string[]).filter(value=>pinnedIndexes.has(indexOf(value)))
     .map(value=>({recommendation_id:value,collection_id:collection,position:indexOf(value),revision:'3'}));
    return {rows:recorder.serve(kind,rows)};
   }
   case 'ownerMemberships':
    expect(sql).toContain('i.recommendation_id');
    return {rows:recorder.serve(kind,[{recommendation_id:id(0),collection_id:collection,collection_revision:4,display_order:9,collection_archived:false,recommendation_archived:false,...(category==='places'?{place_pin_position:membershipPosition}:{})}])};
  }
  return {rows:[]};
 });
 const pool={query,connect:async()=>({query,release:vi.fn()})} as never;
 return {pool,query,recorder,
  assertExercised:(kinds:string[]=[],withRows:string[]=[])=>recorder.assertExercised(kinds,withRows),
  setCollectionRevision:(n:number)=>{collectionRevision=n;},setCategoryRevision:(n:string)=>{categoryRevision=n;},
  setEligibility:(n:string)=>{lane=n;},setMembershipPosition:(n:string|null)=>{membershipPosition=n;},
  setMediaPerItem:(n:number)=>{mediaPerItem=n;},enableCountRace:()=>{countRace=true;}};
}
describe('Places coherent reader contracts without database resources',()=>{
 it('preserves owner null versus int8 zero and rejects unsafe owner membership positions',async()=>{const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;f.setMembershipPosition('0');expect((await service.listMemberships(actor,{category:'places'})).items[0].placePinPosition).toBe(0);f.setMembershipPosition(null);expect((await service.listMemberships(actor,{category:'places'})).items[0].placePinPosition).toBeNull();f.setMembershipPosition('9007199254740992');await expect(service.listMemberships(actor,{category:'places'})).rejects.toThrow('Invalid Places integer');f.assertExercised([],['ownerSnapshotState','ownerMemberships']);});
 it('canonical continuation fences count-preserving independent suppression changes',async()=>{const f=fixture(),service=new PublicContentService(f.pool,'synthetic-test-secret'),base={username:'alice',category:'places',slug:'synthetic',limit:'12'};const first=await service.page(base);f.setEligibility('1');await expect(service.page({...base,cursor:first!.nextCursor})).rejects.toMatchObject({status:409});f.assertExercised([],['publicAccountScope','publicCollectionBySlug','publicEligibilityAggregate','publicPlaceRows']);});
 it('canonical final metadata refuses off-page suppression changes despite unchanged returned identities',async()=>{const f=fixture();f.enableCountRace();await expect(new PublicContentService(f.pool,'synthetic-test-secret').page({username:'alice',category:'places',slug:'synthetic',limit:'12'})).rejects.toMatchObject({status:409});f.assertExercised([],['publicCurrentList','publicEligibilityAggregate']);});
 it('owner collection traverses the pin boundary without losing equal display-order rows',async()=>{
  const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;
  const collected:string[]=[];const mediaWidths:number[]=[],pinned:{id:string;position:number;revision:number;collectionId:string}[]=[];let cursor:string|undefined;
  do{const page=await service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12,cursor});collected.push(...page.items.map(i=>i.id));
   mediaWidths.push(...page.items.map(i=>i.mediaIds.length));
   for(const item of page.items) if(item.pin) pinned.push({id:item.id,...item.pin});
   expect(page.placePins).toEqual({collectionId:collection,collectionRevision:4,categoryContentRevision:'9',eligibleItemCount:30,eligiblePinCount:14});cursor=page.nextCursor??undefined;}while(cursor);
  expect(collected).toEqual(Array.from({length:30},(_,n)=>id(n)));expect(new Set(collected).size).toBe(30);
  // The media lateral and the pin read are live: a `{rows:[]}` fallback would make both
  // of these [] / none, which is what they silently were before.
  expect(mediaWidths).toEqual(Array.from({length:30},()=>2));
  expect(pinned).toEqual([{id:id(0),collectionId:collection,position:0,revision:3},{id:id(17),collectionId:collection,position:17,revision:3}]);
  expect(f.recorder.served.ownerPlaceCounts).toBe(3);
  f.assertExercised([],['ownerPlaceCounts','ownerRecommendationRows','ownerMediaLateral','ownerCategoryPins']);
 });
 it('enforces the owner media response bound once the lateral read actually returns rows',async()=>{
  const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;
  f.setMediaPerItem(20);
  const bounded=await service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12});
  expect(bounded.items[0].mediaIds).toHaveLength(20);
  f.setMediaPerItem(21);
  await expect(service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12}))
   .rejects.toMatchObject({status:413,message:'Owner resource exceeds the media response bound'});
  f.assertExercised([],['ownerMediaLateral','ownerCategoryPins']);
 });
 it('owner list fence conflicts and membership pins remain list-local for private/draft reads',async()=>{
  const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;
  const page=await service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12});f.setCollectionRevision(5);
  await expect(service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12,cursor:page.nextCursor!})).rejects.toMatchObject({status:409});
  const memberships=await service.listMemberships(actor,{category:'places'});expect(memberships.items[0].placePinPosition).toBe(3);
  expect(f.query.mock.calls.find(c=>c[0].includes('FROM collection_items i JOIN collections c'))![0]).toContain('pp.collection_id=i.collection_id');
  f.assertExercised([],['ownerRecommendationRows','ownerMediaLateral','ownerCategoryPins','ownerMemberships']);
 });
 it('canonical public pinned seek is versioned, complete and collection/category fenced',async()=>{
  const f=fixture(),service=new PublicContentService(f.pool,'synthetic-test-secret'),base={username:'alice',category:'places',slug:'synthetic',limit:'12'};
  const first=await service.page(base);expect(first!.placePins).toMatchObject({eligibleItemCount:29,eligiblePinCount:13});
  const next=await service.page({...base,cursor:first!.nextCursor});const terminal=await service.page({...base,cursor:next!.nextCursor});
  expect([...first!.items,...next!.items,...terminal!.items].map(i=>i.id)).toEqual(Array.from({length:29},(_,n)=>id(n+1)));
  expect(terminal!.nextCursor).toBeNull();f.setCategoryRevision('10');await expect(service.page({...base,cursor:first!.nextCursor})).rejects.toMatchObject({status:409});
  await expect(service.page({...base,slug:'other',cursor:first!.nextCursor})).rejects.toBeInstanceOf(PublicContentFailure);
  f.assertExercised([],['publicAccountScope','publicCollectionBySlug','publicCategoryState','publicEligibilityAggregate','publicPlaceRows','publicCurrentList','publicCurrentEligibility']);
 });
 it('other-category membership and canonical public payload omit Places-only metadata',async()=>{
  const f=fixture('books'),owner=new OwnerContentService(f.pool,'synthetic-test-secret');
  const membership=await owner.listMemberships({accountId:account} as never,{category:'books'});expect(membership.items[0]).not.toHaveProperty('placePinPosition');
  const page=await new PublicContentService(f.pool,'synthetic-test-secret').page({username:'alice',category:'books',slug:'synthetic',limit:'12'});expect(page).not.toHaveProperty('placePins');
  expect(f.query.mock.calls.find(c=>c[0].includes('FROM collection_items ci'))![0]).not.toContain('collection_place_pins');
  f.assertExercised([],['ownerMemberships','publicCollectionRows']);
 });
});
