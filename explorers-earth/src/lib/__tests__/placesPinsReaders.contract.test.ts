import {describe,it,expect,vi} from 'vitest';
vi.mock('../../../../tunes/server/application/authorization',()=>({authorizeOperation:vi.fn()}));
import {OwnerContentService} from '../../../../tunes/server/application/ownerContent';
import {PublicContentService,PublicContentFailure} from '../../../../tunes/server/application/publicContent';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',collection='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id=(n:number)=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
function fixture(category='places'){
 let collectionRevision=4,categoryRevision='9',lane='0',membershipPosition:string|null='3',committed=false,countRace=false;
 const all=Array.from({length:30},(_,n)=>({id:id(n),account_id:account,entity_id:id(n),category,content_category:category,user_rating:null,publication_state:n===0?'draft':'published',revision:1,archived_at:null,page_order:category==='places'?String(n<14?n:0):n<14?n:0,display_order:category==='places'?String(n<14?n:0):n<14?n:0,pin_bucket:n<14?0:1,canonical_title:'Synthetic',display_values:{},title_bytes:10,override_schema_version:null,kind:category==='places'?'place':'book'}));
 const query=vi.fn(async(sql:string,values:any[]=[])=>{
  if(sql==='COMMIT'){committed=true;return {rows:[]};}
  if(sql.includes('public_places_current_list'))return {rows:[{id:collection,collection_revision:String(collectionRevision),category_revision:categoryRevision}]};
  if(sql.includes('public_places_current_eligibility'))return {rows:(values[1]??[]).map((id:string,n:number)=>({id,entity_id:values[2][n],collection_id:values[3][n]}))};
  if(sql.includes('SELECT coalesce((SELECT revision::text'))return {rows:[{revision:categoryRevision,pin_revision:null}]};
  if(sql.includes('SELECT a.id FROM creator_accounts'))return {rows:[{id:account}]};
  if(sql.includes('SELECT id,revision'))return {rows:[{id:collection,revision:String(collectionRevision)}]};
  if(sql.includes('count(*)::text'))return {rows:[{item_count:sql.includes("r.publication_state='published'")?(countRace&&committed?'28':'29'):'30',pin_count:sql.includes("r.publication_state='published'")?'13':'14',lane_0:lane,lane_1:'0',lane_2:'0',lane_3:'0'}]};
  if(sql.includes('SELECT r.id,')){
   const publicPage=sql.includes('canonical_title');
   let bucket:number|undefined,position:number|undefined,last:string|undefined;
   if(values.length===7){bucket=values[3];position=values[4];last=values[5];}
   const rows=all.filter(row=>(!publicPage||row.publication_state==='published')&&(bucket==null||row.pin_bucket>bucket||row.pin_bucket===bucket&&(Number(row.page_order)>position!||Number(row.page_order)===position&&row.id>last!)));
   if(publicPage)expect(sql).toContain("r.publication_state='published'");
   if(category==='places'){expect(sql).toContain('collection_place_pins');expect(sql).toContain('ORDER BY CASE WHEN pp.recommendation_id IS NULL THEN 1 ELSE 0 END,coalesce(pp.position,');}
   return {rows:rows.slice(0,values.at(-1))};
  }
  if(sql.includes('SELECT i.recommendation_id'))return {rows:[{recommendation_id:id(0),collection_id:collection,collection_revision:4,display_order:9,collection_archived:false,recommendation_archived:false,...(category==='places'?{place_pin_position:membershipPosition}:{})}]};
  return {rows:[]};
 });
 const pool={query,connect:async()=>({query,release:vi.fn()})} as never;
 return {pool,query,setCollectionRevision:(n:number)=>{collectionRevision=n;},setCategoryRevision:(n:string)=>{categoryRevision=n;},setEligibility:(n:string)=>{lane=n;},setMembershipPosition:(n:string|null)=>{membershipPosition=n;},enableCountRace:()=>{countRace=true;}};
}
describe('Places coherent reader contracts without database resources',()=>{
 it('preserves owner null versus int8 zero and rejects unsafe owner membership positions',async()=>{const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;f.setMembershipPosition('0');expect((await service.listMemberships(actor,{category:'places'})).items[0].placePinPosition).toBe(0);f.setMembershipPosition(null);expect((await service.listMemberships(actor,{category:'places'})).items[0].placePinPosition).toBeNull();f.setMembershipPosition('9007199254740992');await expect(service.listMemberships(actor,{category:'places'})).rejects.toThrow('Invalid Places integer');});
 it('canonical continuation fences count-preserving independent suppression changes',async()=>{const f=fixture(),service=new PublicContentService(f.pool,'synthetic-test-secret'),base={username:'alice',category:'places',slug:'synthetic',limit:'12'};const first=await service.page(base);f.setEligibility('1');await expect(service.page({...base,cursor:first!.nextCursor})).rejects.toMatchObject({status:409});});
 it('canonical final metadata refuses off-page suppression changes despite unchanged returned identities',async()=>{const f=fixture();f.enableCountRace();await expect(new PublicContentService(f.pool,'synthetic-test-secret').page({username:'alice',category:'places',slug:'synthetic',limit:'12'})).rejects.toMatchObject({status:409});});
 it('owner collection traverses the pin boundary without losing equal display-order rows',async()=>{
  const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;
  const collected:string[]=[];let cursor:string|undefined;
  do{const page=await service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12,cursor});collected.push(...page.items.map(i=>i.id));expect(page.placePins).toEqual({collectionId:collection,collectionRevision:4,categoryContentRevision:'9',eligibleItemCount:30,eligiblePinCount:14});cursor=page.nextCursor??undefined;}while(cursor);
  expect(collected).toEqual(Array.from({length:30},(_,n)=>id(n)));expect(new Set(collected).size).toBe(30);
  expect(f.query.mock.calls.filter(c=>c[0].includes('count(*)::text'))).toHaveLength(3);
 });
 it('owner list fence conflicts and membership pins remain list-local for private/draft reads',async()=>{
  const f=fixture(),service=new OwnerContentService(f.pool,'synthetic-test-secret'),actor={accountId:account} as never;
  const page=await service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12});f.setCollectionRevision(5);
  await expect(service.listRecommendations(actor,{category:'places',collectionId:collection,limit:12,cursor:page.nextCursor!})).rejects.toMatchObject({status:409});
  const memberships=await service.listMemberships(actor,{category:'places'});expect(memberships.items[0].placePinPosition).toBe(3);
  expect(f.query.mock.calls.find(c=>c[0].includes('SELECT i.recommendation_id'))![0]).toContain('pp.collection_id=i.collection_id');
 });
 it('canonical public pinned seek is versioned, complete and collection/category fenced',async()=>{
  const f=fixture(),service=new PublicContentService(f.pool,'synthetic-test-secret'),base={username:'alice',category:'places',slug:'synthetic',limit:'12'};
  const first=await service.page(base);expect(first!.placePins).toMatchObject({eligibleItemCount:29,eligiblePinCount:13});
  const next=await service.page({...base,cursor:first!.nextCursor});const terminal=await service.page({...base,cursor:next!.nextCursor});
  expect([...first!.items,...next!.items,...terminal!.items].map(i=>i.id)).toEqual(Array.from({length:29},(_,n)=>id(n+1)));
  expect(terminal!.nextCursor).toBeNull();f.setCategoryRevision('10');await expect(service.page({...base,cursor:first!.nextCursor})).rejects.toMatchObject({status:409});
  await expect(service.page({...base,slug:'other',cursor:first!.nextCursor})).rejects.toBeInstanceOf(PublicContentFailure);
 });
 it('other-category membership and canonical public payload omit Places-only metadata',async()=>{
  const f=fixture('books'),owner=new OwnerContentService(f.pool,'synthetic-test-secret');
  const membership=await owner.listMemberships({accountId:account} as never,{category:'books'});expect(membership.items[0]).not.toHaveProperty('placePinPosition');
  const page=await new PublicContentService(f.pool,'synthetic-test-secret').page({username:'alice',category:'books',slug:'synthetic',limit:'12'});expect(page).not.toHaveProperty('placePins');expect(f.query.mock.calls.find(c=>c[0].includes('canonical_title'))![0]).not.toContain('collection_place_pins');
 });
});
