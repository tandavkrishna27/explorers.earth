import {describe,it,expect,vi} from 'vitest';
import {emptyPlaceDetails,emptyPlaceContext} from '../../../../tunes/shared/explorersPlaceContract';
vi.mock('../../../../tunes/server/repositories/placeCatalogRepository',()=>({
 readPlaceEntity:async()=>({title:'Synthetic place',details:emptyPlaceDetails()}),effectivePlaceDetails:(details:unknown)=>details,
 readPlaceContext:async()=>({...emptyPlaceContext(),contactName:'Private synthetic contact',contactNumber:'+1234567890',contactVisibility:'private'}),
 readPlacePhotoMediaIds:async()=>[],readPlaceCollectionDetails:async()=>({locationEntityId:null,locationSnapshot:null,instagramMediaUrl:null}),
}));
vi.mock('../../../../tunes/server/publicProfile/publicTaxonomyProjection',()=>({publicCatalogFence:async()=>null,samePublicCatalog:(a:unknown,b:unknown)=>a===b,publicAssignedTaxonomy:async()=>({root:null,child:null})}));
vi.mock('../../../../tunes/server/publicProfile/publicPeopleProjection',()=>({publicLinkedPeopleLists:async()=>[],publicPeopleScope:async()=>undefined,samePeopleScope:()=>true,publicPeopleResultEligible:async()=>true}));
vi.mock('../../../../tunes/server/publicProfile/publicProductsProjection',()=>({publicLinkedProductsLists:async()=>[]}));
vi.mock('../../../../tunes/server/repositories/personCatalogRepository',()=>({readPersonEntity:async()=>({title:'Synthetic person',suppressed:false})}));
import {publicPlacesProjection} from '../../../../tunes/server/publicProfile/publicPlacesProjection';
import {PublicPlaceCursorError,PublicPlaceRestartConflict} from '../../../../tunes/server/application/placePinsRead';
const account='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',list='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',secret='synthetic-test-only-secret-32-bytes';
const id=(n:number)=>`cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12,'0')}`;
function fixture(options:{person?:boolean;suppressionRace?:boolean;entityRace?:boolean;countRace?:boolean;swapRace?:boolean;empty?:boolean;hideRace?:boolean;largePosition?:boolean;unsafePosition?:boolean}={}){
 let revision='4',committed=false,lane='0';
 const rows=Array.from({length:30},(_,n)=>({id:id(n),account_id:account,entity_id:id(n),entity_kind:options.person?'person':'place',user_rating:null,note:null,note_bytes:0,override_bytes:0,display_values:{},display_order:0,collection_id:list,collection_title:'Synthetic list',collection_slug:'synthetic',provider_place_id:null,pin_order:n<14?String(n):null,pin_bucket:n<14?0:1,sort_position:String(n<14?n:0)})).slice(2);
 if(options.empty)rows.length=0;
 for(const row of rows)if(options.largePosition||options.unsafePosition){if(row.pin_order!==null)row.pin_order=String((options.unsafePosition?BigInt('9007199254740992'):BigInt('2147483648'))+BigInt(row.pin_order));row.sort_position=row.pin_order??'0';}
 const query=vi.fn(async(sql:string,params:any[]=[])=>{
  if(sql==='COMMIT'){committed=true;return {rows:[]};}
  if(sql.includes('public_places_current_list'))return {rows:options.hideRace&&committed?[]:[{id:list,collection_revision:revision,category_revision:'9'}]};
  if(sql.includes('public_places_current_eligibility'))return {rows:options.suppressionRace?[]:(params[1]??[]).map((id:string,n:number)=>({id,entity_id:options.entityRace?account:params[2][n],collection_id:params[3][n]}))};
  if(sql.includes('FROM creator_accounts'))return {rows:[{id:account,handle:'alice',account_revision:'1',content_revision:'9'}]};
  if(sql.includes('SELECT c.id,c.revision'))return {rows:[{id:list,collection_revision:revision,title:'Synthetic list',slug:'synthetic',display_order:0,description:null,heading:null,cover_media_id:null}]};
  if(sql.includes('count(*)::text')){for(const gate of ["c.visibility='public'","c.publication_state='published'","r.publication_state='published'",'r.archived_at IS NULL','a.public_profile'])expect(sql).toContain(gate);expect(sql).toContain('sha256(convert_to(');expect(sql).toContain('substr(fingerprint.hash,49,16)');expect(sql).toContain('pd.suppressed_at IS NOT NULL');expect(sql).toContain('pp.collection_id=ci.collection_id');return {rows:[{item_count:options.empty?(options.countRace&&committed?'1':'0'):options.countRace&&committed?'27':'28',pin_count:options.empty?'0':options.countRace&&committed?'11':'12',lane_0:options.swapRace&&committed?'1':lane,lane_1:'0',lane_2:'0',lane_3:'0'}]};}
  if(sql.includes('SELECT r.id,r.account_id')){expect(sql).not.toContain('category_recommendation_pins');expect(sql).not.toContain(' OFFSET ');return {rows:rows.filter(row=>params[2]==null||row.pin_bucket>params[2]||row.pin_bucket===params[2]&&(Number(row.sort_position)>params[3]||Number(row.sort_position)===params[3]&&row.id>params[4])).slice(0,params[5])};}
  return {rows:[]};
 });
 return {pool:{query,connect:async()=>({query,release:vi.fn()})} as never,setRevision:(value:string)=>{revision=value;},setEligibility:(value:string)=>{lane=value;}};
}
describe('actually consumed Places compatibility projection',()=>{
 it.each([{countRace:true},{swapRace:true},{empty:true,countRace:true}])('restarts when off-page eligibility/count fingerprint changes in fresh snapshot %j',async options=>{const f=fixture(options);await expect(publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret)).rejects.toBeInstanceOf(PublicPlaceRestartConflict);});
 it('validates empty-list public metadata after composition and denies a newly private list',async()=>{const f=fixture({empty:true,hideRace:true});expect(await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret)).toBeUndefined();});
 it('binds off-page count-preserving eligibility swaps across continuation requests',async()=>{const f=fixture();const first=await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret);f.setEligibility('1');await expect(publicPlacesProjection(f.pool,'alice',12,first!.recommendationLists[0].recommended_places_next_cursor!,'synthetic',secret)).rejects.toBeInstanceOf(PublicPlaceRestartConflict);});
 it('traverses int8 ranks above int32 and rejects unsafe raw driver values',async()=>{const f=fixture({largePosition:true});const first=await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret);expect(first!.recommendationLists[0].recommended_places[0].pin_order).toBe(2147483650);const next=await publicPlacesProjection(f.pool,'alice',12,first!.recommendationLists[0].recommended_places_next_cursor!,'synthetic',secret);expect(next!.recommendationLists[0].recommended_places[0].pin_order).toBeNull();await expect(publicPlacesProjection(fixture({unsafePosition:true}).pool,'alice',12,undefined,'synthetic',secret)).rejects.toThrow('Invalid Places integer');});
 it('hydrates a person through its own entity DTO without invented place facts',async()=>{const f=fixture({person:true});const first=await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret);expect(first!.recommendationLists[0].recommended_places[0].Place_Details).toMatchObject({Place_Name:'Synthetic person',Geometry:null,Rating:null});});
 it.each([{suppressionRace:true},{entityRace:true}])('fails closed when current own-row eligibility changes after composition %j',async options=>{const f=fixture(options);expect(await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret)).toBeUndefined();});
 it('serves all 28 eligible children across stored pin gaps and equal unpinned order with coherent counts',async()=>{
  const f=fixture();const first=await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret);
  const parent=first!.recommendationLists[0];expect(parent).toMatchObject({eligible_item_count:28,eligible_pin_count:12,collection_revision:'4',category_content_revision:'9'});
  expect(parent.recommended_places[0]).toMatchObject({documentId:id(2),pin_order:2,is_pinned:true});
  const next=await publicPlacesProjection(f.pool,'alice',12,parent.recommended_places_next_cursor!,'synthetic',secret);
  const terminal=await publicPlacesProjection(f.pool,'alice',12,next!.recommendationLists[0].recommended_places_next_cursor!,'synthetic',secret);
  expect([...parent.recommended_places,...next!.recommendationLists[0].recommended_places,...terminal!.recommendationLists[0].recommended_places].map(p=>p.documentId)).toEqual(Array.from({length:28},(_,n)=>id(n+2)));
  expect(terminal!.recommendationLists[0].recommended_places_next_cursor).toBeNull();expect(JSON.stringify(first)).not.toContain('Private synthetic contact');expect(JSON.stringify(first)).not.toContain('+1234567890');
 });
 it('denies legacy child offsets and signals collection fence restart',async()=>{
  const f=fixture();await expect(publicPlacesProjection(f.pool,'alice',12,'o12','synthetic',secret)).rejects.toBeInstanceOf(PublicPlaceCursorError);
  const first=await publicPlacesProjection(f.pool,'alice',12,undefined,'synthetic',secret);f.setRevision('5');
  await expect(publicPlacesProjection(f.pool,'alice',12,first!.recommendationLists[0].recommended_places_next_cursor!,'synthetic',secret)).rejects.toBeInstanceOf(PublicPlaceRestartConflict);
 });
});
