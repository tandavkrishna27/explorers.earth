import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {ExplorersPlacePinsRepository} from '../repositories/explorersPlacePinsRepository';
import {ExplorersRecommendationRepository} from '../repositories/explorersRecommendationRepository';
import {createPlacePinsSequenceHasher,hashPlacePinsChunk,hashPlacePinsRequest} from '../application/placePinsBoundary';
import type {PlacePinsRequest} from '../../shared/explorersPlacePinsContract';
import {lockContentCategories} from '../db/explorers-content-lock';
import {verifyMusicRuntimeLogin} from '../db/music-runtime-role';
import {AccountLifecycleService} from '../application/accountLifecycle';
import type {Actor} from '../application/actor';
// Fixture only. Neither these values nor their cardinalities are production policy.
const policy={policyId:'disposable-fixture-only',policyVersion:1,transportChunkBytes:4096,transportChunkIds:32,replacementBytes:8192,replacementIds:64,ownerDraftQuota:2,ownerStagingBytes:100000,draftExpiryMs:60000,stagingRetentionMs:120000,receiptRetentionMs:180000,commitProcessingBytes:200000,commitProcessingMs:10000,commitWorkUnits:10000,cleanupBatchSize:10,cleanupWorkUnits:100};
let admin:pg.Pool,runtime:pg.Pool,repo:ExplorersPlacePinsRepository;
(process.env.PLACE_PINS_POSTGRES_TEST==='1'?describe.sequential:describe.skip)('Places P1 actual PostgreSQL acceptance (authored, requires approved guard)',()=>{
beforeAll(async()=>{
 // Root must document and approve the exact disposable database before setting
 // this explicit identity. No protected fixture URL or checkout credential fallback.
 const source=process.env.DATABASE_URL_TEST,runtimeSource=process.env.PLACE_PINS_RUNTIME_DATABASE_URL_TEST,identity=process.env.PLACE_PINS_DISPOSABLE_DATABASE;
 if(!source||!runtimeSource||!identity)throw new Error('Approved Places disposable database and separate runtime login identities are required');
 const url=new URL(source),runtimeUrl=new URL(runtimeSource);
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||decodeURIComponent(url.pathname.slice(1))!==identity||!/^explorers_place_pins_disposable_[a-z0-9_]+$/.test(identity)||runtimeUrl.hostname!==url.hostname||runtimeUrl.port!==url.port||runtimeUrl.pathname!==url.pathname||runtimeUrl.username===url.username)throw new Error('Places disposable database guard rejected the target');
 admin=new pg.Pool({connectionString:source,max:3});
 expect((await admin.query('SELECT current_database() name')).rows[0].name).toBe(identity);
 const direct=new pg.Pool({connectionString:runtimeSource,max:1});
 try{await verifyMusicRuntimeLogin(admin,direct,{loginRole:decodeURIComponent(runtimeUrl.username)});}finally{await direct.end();}
 runtime=new pg.Pool({connectionString:runtimeSource,options:'-c role=music_runtime',max:2});
 const role=(await runtime.query(`SELECT current_database() database,current_user effective,session_user login,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,
  pg_has_role(session_user,'music_runtime','MEMBER') member FROM pg_roles r WHERE r.rolname=session_user`)).rows[0];
 expect(role).toMatchObject({database:identity,effective:'music_runtime',login:decodeURIComponent(runtimeUrl.username),rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false,member:true});
 repo=new ExplorersPlacePinsRepository(runtime);
});
afterAll(async()=>{await runtime?.end();await admin?.end();});
type Fixture={account:string;list:string;otherList:string;ids:string[];allLists?:string[];allIds?:string[];entityIds?:string[];sectionIds?:string[]};
async function seed(count=3):Promise<Fixture>{
 const account=(await admin.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
 const lists:string[]=[];for(let i=0;i<2;i++)lists.push((await admin.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'places','Fixture',$2,$3) RETURNING id",[account,randomUUID(),i])).rows[0].id);
 const ids:string[]=[];
 for(let i=0;i<count;i++){
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('place','Synthetic location','manual') RETURNING id")).rows[0].id;
  const id=(await admin.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'places',$2) RETURNING id",[account,entity])).rows[0].id;ids.push(id);
  for(const list of lists)await admin.query("INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,'places',$4)",[list,id,account,i]);
 }
 return {account,list:lists[0],otherList:lists[1],ids};
}
async function versions(f:Fixture,list=f.list){const row=(await admin.query("SELECT c.revision collection,s.revision category FROM collections c JOIN account_category_content_state s ON s.account_id=c.account_id AND s.category=c.category WHERE c.id=$1",[list])).rows[0];return {collection:Number(row.collection),category:BigInt(row.category)};}
async function fences(f:Fixture){const v=await versions(f);return {expectedCollectionRevision:v.collection,expectedCategoryContentRevision:String(v.category)};}
async function command(f:Fixture,request:PlacePinsRequest,key=randomUUID(),activePolicy=policy){return repo.execute(f.account,request,{requestId:randomUUID(),idempotencyKey:key},Buffer.byteLength(JSON.stringify(request)),activePolicy) as Promise<any>;}
async function replace(f:Fixture,ids=f.ids,key=randomUUID()){return command(f,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:ids}},key);}
async function begin(f:Fixture){return command(f,{operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)});}
async function append(f:Fixture,draftId:string,index:number,ids:string[],key=randomUUID()){return command(f,{operation:'appendPlacePinsChunk',collectionId:f.list,draftId,chunkIndex:index,body:{recommendationIds:ids,chunkHash:hashPlacePinsChunk(index,ids)}},key);}
async function commit(f:Fixture,draftId:string,ids:string[]){const hasher=createPlacePinsSequenceHasher();hasher.append(ids);return command(f,{operation:'commitPlacePinsDraft',collectionId:f.list,draftId,body:{totalCount:ids.length,sequenceHash:hasher.finish()}});}
async function live(f:Fixture,list=f.list){return (await admin.query('SELECT recommendation_id,position FROM collection_place_pins WHERE collection_id=$1 ORDER BY position',[list])).rows.map(row=>({id:row.recommendation_id,position:Number(row.position)}));}
// Preserve native PostgreSQL bigint strings, JSON, buffers and dates for rollback equality.
async function snapshot(f:Fixture,draftIds:string[]=[]){
 const pins=(await admin.query('SELECT * FROM collection_place_pins WHERE collection_id=ANY($1::uuid[]) ORDER BY collection_id,position',[ [f.list,f.otherList] ])).rows;
 const collections=(await admin.query('SELECT id,category,revision,archived_at FROM collections WHERE id=ANY($1::uuid[]) ORDER BY id',[[f.list,f.otherList]])).rows;
 const categories=(await admin.query('SELECT * FROM account_category_content_state WHERE account_id=$1 ORDER BY category',[f.account])).rows;
 const drafts=(await admin.query('SELECT * FROM place_pin_drafts WHERE id=ANY($1::uuid[]) ORDER BY id',[draftIds])).rows;
 const chunks=(await admin.query('SELECT * FROM place_pin_draft_chunks WHERE draft_id=ANY($1::uuid[]) ORDER BY draft_id,chunk_index',[draftIds])).rows;
 const items=(await admin.query('SELECT * FROM place_pin_draft_items WHERE draft_id=ANY($1::uuid[]) ORDER BY draft_id,chunk_index,item_index',[draftIds])).rows;
 return {pins,collections,categories,drafts,chunks,items};
}
async function receipt(f:Fixture,request:PlacePinsRequest,key:string){return (await admin.query('SELECT * FROM application_command_receipts WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3',[f.account,request.operation,createHash('sha256').update(key).digest()])).rows;}
// Batch B owns complete SQL oracles; the earlier partial snapshot stays unchanged.
type SqlSetup={f:Fixture;request:PlacePinsRequest;context:{requestId:string;idempotencyKey:string};rows:any[]};
async function sqlSetup(f:Fixture,pinned=true,accepted=true){
 const records:SqlSetup[]=[];
 const write=async(target:Fixture,request:PlacePinsRequest)=>{
  const context={requestId:randomUUID(),idempotencyKey:randomUUID()};
  const result=await repo.execute(target.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy) as any;
  const rows=await receipt(target,request,context.idempotencyKey);expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({request_hash:Buffer.from(hashPlacePinsRequest(request),'hex'),idempotency_key_hash:createHash('sha256').update(context.idempotencyKey).digest(),response:result});
  records.push({f:target,request,context,rows});return result;
 };
 for(const list of [f.list,f.otherList]){
  const target={...f,list};
  if(pinned)await write(target,{operation:'replacePlacePins',collectionId:list,body:{...await fences(target),orderedRecommendationIds:f.ids}});
  const draft=await write(target,{operation:'beginPlacePinsDraft',collectionId:list,body:await fences(target)});
  if(accepted)await write(target,appendRequest(target,draft.draftId,f.ids));
 }
 return records;
}
async function completeSqlSnapshot(fixtures:Fixture[],records:SqlSetup[],extraEntities:string[]=[]){
 const accounts=fixtures.map(f=>f.account),lists=fixtures.flatMap(f=>f.allLists??[f.list,f.otherList]),ids=fixtures.flatMap(f=>f.allIds??f.ids);
 const collections=(await admin.query('SELECT * FROM collections WHERE id=ANY($1::uuid[]) ORDER BY id',[lists])).rows;
 const memberships=(await admin.query('SELECT * FROM collection_items WHERE collection_id=ANY($1::uuid[]) ORDER BY collection_id,display_order,recommendation_id',[lists])).rows;
 const recommendations=(await admin.query('SELECT * FROM recommendations WHERE id=ANY($1::uuid[]) ORDER BY id',[ids])).rows;
 const entityIds=[...new Set([...recommendations.map(row=>row.entity_id),...extraEntities,...fixtures.flatMap(f=>f.entityIds??[])])];
 const entities=(await admin.query('SELECT * FROM entities WHERE id=ANY($1::uuid[]) ORDER BY id',[entityIds])).rows;
 const pins=(await admin.query('SELECT * FROM collection_place_pins WHERE collection_id=ANY($1::uuid[]) ORDER BY collection_id,position,recommendation_id',[lists])).rows;
 const categories=(await admin.query('SELECT * FROM account_category_content_state WHERE account_id=ANY($1::uuid[]) ORDER BY account_id,category',[accounts])).rows;
 const drafts=(await admin.query('SELECT * FROM place_pin_drafts WHERE account_id=ANY($1::uuid[]) ORDER BY id',[accounts])).rows;
 const draftIds=drafts.map(row=>row.id);
 const capturedDraftIds=[...new Set([...draftIds,...records.filter(r=>r.request.operation==='beginPlacePinsDraft').map(r=>r.rows[0].response.draftId)])];
 const chunks=(await admin.query('SELECT * FROM place_pin_draft_chunks WHERE draft_id=ANY($1::uuid[]) ORDER BY draft_id,chunk_index',[capturedDraftIds])).rows;
 const items=(await admin.query('SELECT * FROM place_pin_draft_items WHERE draft_id=ANY($1::uuid[]) ORDER BY draft_id,chunk_index,item_index',[capturedDraftIds])).rows;
 const markers=(await admin.query('SELECT * FROM places_collection_mutation_state WHERE collection_id=ANY($1::uuid[]) ORDER BY collection_id',[lists])).rows;
 const pinQueue=(await admin.query('SELECT * FROM places_pin_validation_dirty WHERE collection_id=ANY($1::uuid[]) ORDER BY validation_xid,collection_id',[lists])).rows;
 // Setup identities retain deleted draft IDs, so cascade cannot hide dirty rows.
 const addressed=[...new Set([...draftIds,...records.filter(r=>'draftId' in r.request).map(r=>(r.request as Extract<PlacePinsRequest,{draftId:string}>).draftId),...records.filter(r=>r.request.operation==='beginPlacePinsDraft').map(r=>r.rows[0].response.draftId)])];
 const chunkQueue=(await admin.query('SELECT * FROM places_chunk_validation_dirty WHERE draft_id=ANY($1::uuid[]) ORDER BY validation_xid,draft_id,chunk_index',[addressed])).rows;
 const receipts=(await admin.query('SELECT * FROM application_command_receipts WHERE account_id=ANY($1::uuid[]) ORDER BY id',[accounts])).rows;
 const exactReceipts=[];for(const record of records)exactReceipts.push(await receipt(record.f,record.request,record.context.idempotencyKey));
 // Fixed table names are fixture inventory, never caller-controlled SQL. Capture
 // child IDs independently of surviving parents and preserve native SQL values.
 const inventory:Record<string,any[]>={};
 for(const [table,order] of ownedSqlRelations){
  const parent=table.startsWith('recommendation_')||['book_recommendation_context','movie_recommendation_context','product_recommendation_context','place_recommendation_context'].includes(table)?'recommendation_id':table==='collection_location_links'?'child_collection_id':['collection_media','place_collection_details','guide_collection_details','guide_sections'].includes(table)?'collection_id':table==='guide_section_photos'?'section_id':undefined;
  const captured=parent==='recommendation_id'?ids:parent==='section_id'?fixtures.flatMap(f=>f.sectionIds??[]):lists;
  inventory[table]=(await admin.query(`SELECT * FROM ${table} WHERE account_id=ANY($1::uuid[])${parent?` OR ${parent}=ANY($2::uuid[])`:''} ORDER BY ${order}`,parent?[accounts,captured]:[accounts])).rows;
 }
 for(const table of ['book_entity_details','app_entity_details','product_entity_details','person_entity_details','place_entity_details','movie_entity_details','entity_identifiers'])inventory[table]=(await admin.query(`SELECT * FROM ${table} WHERE entity_id=ANY($1::uuid[]) ORDER BY entity_id,to_jsonb(${table})::text`,[entityIds])).rows;
 for(const table of sharedSqlRelations)inventory[table]=(await admin.query(`SELECT * FROM ${table} ORDER BY to_jsonb(${table})::text`)).rows;
 inventory.creator_accounts=(await admin.query('SELECT * FROM creator_accounts WHERE id=ANY($1::uuid[]) ORDER BY id',[accounts])).rows;
 // Global pre-existing dirty queues cannot disappear behind deleted parent joins.
 inventory.places_pin_validation_dirty=(await admin.query('SELECT * FROM places_pin_validation_dirty ORDER BY validation_xid,collection_id')).rows;
 inventory.places_chunk_validation_dirty=(await admin.query('SELECT * FROM places_chunk_validation_dirty ORDER BY validation_xid,draft_id,chunk_index')).rows;
 return {collections,memberships,recommendations,entities,pins,categories,drafts,chunks,items,markers,pinQueue,chunkQueue,receipts,exactReceipts,inventory};
}
const ownedSqlRelations=[['collection_media','collection_id,slot'],['collection_location_links','child_collection_id'],['place_collection_details','collection_id'],['guide_collection_details','collection_id'],['guide_sections','id'],['guide_section_photos','section_id,media_id'],['recommendation_media','recommendation_id,display_order'],['recommendation_display_overrides','recommendation_id'],['book_recommendation_context','recommendation_id'],['recommendation_book_covers','recommendation_id,slot'],['movie_recommendation_context','recommendation_id'],['product_recommendation_context','recommendation_id'],['place_recommendation_context','recommendation_id'],['recommendation_place_photos','recommendation_id,slot_index'],['recommendation_taxonomy','recommendation_id,position'],['recommendation_movie_media','recommendation_id,slot,slot_index'],['recommendation_app_screenshots','recommendation_id,slot_index'],['category_recommendation_pins','account_id,category,position'],['account_category_pin_state','account_id,category'],['media_assets','id'],['analytics_events','id'],['analytics_event_receipts','account_id,client_event_id'],['account_lifecycle_operations','id'],['deletion_feedback','id']] as const;
const sharedSqlRelations=['taxonomy_terms','taxonomy_term_translations','taxonomy_catalogs','taxonomy_source_mappings','taxonomy_legacy_slug_mappings','taxonomy_import_receipts','movie_provider_genre_terms','movie_entity_provider_genres'] as const;
const fixtureTime='2020-01-01T00:00:00.000Z',movieFetchedMs=1577836800000;
async function readySqlAsset(db:Pick<pg.Pool,'query'>|pg.PoolClient,account:string,purpose='recommendation'){
 return (await db.query("INSERT INTO media_assets(account_id,purpose,status,mime_type,byte_size,content_sha256,ready_at) VALUES($1,$2,'ready','image/jpeg',2048,$3,$4) RETURNING id",[account,purpose,Buffer.alloc(32,7),fixtureTime])).rows[0].id as string;
}
async function lifecycleSqlOperation(account:string,kind='delete',state='running'){
 const receiptId=(await admin.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,$2,$3,$4,'{}') RETURNING id",[account,kind,createHash('sha256').update(randomUUID()).digest(),createHash('sha256').update(randomUUID()).digest()])).rows[0].id;
 const feedback=kind==='delete'?(await admin.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Fixture terminal deletion') RETURNING id",[account])).rows[0].id:null;
 return (await admin.query('INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id) VALUES($1,$2,$3,1,$4,$5) RETURNING id',[account,kind,state,feedback,receiptId])).rows[0].id as string;
}
// Source-valid SQL readiness is fixture provenance only: no provider/storage call.
async function fullOwnedSqlFixture(){
 const target=await seed(2),foreign=await seed(2),entityIds=(await admin.query('SELECT entity_id FROM recommendations WHERE id=ANY($1::uuid[]) ORDER BY id',[[...target.ids,...foreign.ids]])).rows.map(r=>r.entity_id as string);
 const places=(await admin.query('SELECT id,entity_id FROM recommendations WHERE id=ANY($1::uuid[])',[target.ids])).rows;
 const shared:Record<string,string>={places:places.find(r=>r.id===target.ids[0]).entity_id};
 const externalId=String(100000000+Math.floor(Math.random()*800000000));
 const result=await rawSqlTransaction(async db=>{
  for(let i=0;i<2;i++)await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[foreign.ids[i],places.find(r=>r.id===target.ids[i]).entity_id]);
  for(const [category,kind] of [['books','book'],['games','game'],['apps','app'],['products','product'],['people','person'],['movies','movie']]){
   const provider=category==='movies';shared[category]=(await db.query('INSERT INTO entities(kind,title,origin,facts_version) VALUES($1,$2,$3,1) RETURNING id',[kind,'Shared SQL fixture',provider?'provider':'manual'])).rows[0].id;entityIds.push(shared[category]);
  }
  for(const [category,table] of [['places','place_entity_details'],['books','book_entity_details'],['people','person_entity_details']])await db.query(`INSERT INTO ${table}(entity_id) VALUES($1)`,[shared[category]]);
  await db.query("INSERT INTO app_entity_details(entity_id,app_url) VALUES($1,'https://example.invalid/app')",[shared.apps]);
  await db.query("INSERT INTO product_entity_details(entity_id,product_url) VALUES($1,'https://example.invalid/product')",[shared.products]);
  await db.query("INSERT INTO entity_identifiers(entity_id,provider,external_kind,external_id,source_url,fetched_at) VALUES($1,'tmdb','movie',$2,$3,to_timestamp($4/1000.0))",[shared.movies,externalId,`https://api.themoviedb.org/3/movie/${externalId}`,movieFetchedMs]);
  await db.query("INSERT INTO movie_entity_details(entity_id,media_type,poster_url) VALUES($1,'movie','https://image.tmdb.org/t/p/w780/fixture.jpg')",[shared.movies]);
  const term=(await db.query("INSERT INTO taxonomy_terms(category,slug) VALUES('movies',$1) RETURNING id",[randomUUID()])).rows[0].id;
  await db.query("INSERT INTO taxonomy_term_translations(term_id,locale,label) VALUES($1,'en','Fixture')",[term]);
  for(const f of [target,foreign]){
   f.allLists=[f.list,f.otherList];f.allIds=[...f.ids];f.entityIds=[...entityIds];
   const lists:Record<string,string>={places:f.list},recs:Record<string,string>={places:f.ids[0]};
   for(const category of ['books','games','apps','movies','products','people','guides']){
    lists[category]=(await db.query('INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,$2,$3,$4,0) RETURNING id',[f.account,category,'Fixture',randomUUID()])).rows[0].id;f.allLists.push(lists[category]);
    if(category!=='guides'){
     recs[category]=(await db.query('INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,$2,$3) RETURNING id',[f.account,category,shared[category]])).rows[0].id;f.allIds.push(recs[category]);
     await db.query('INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,0)',[lists[category],recs[category],f.account,category]);
    }
   }
   const image=await readySqlAsset(db,f.account),cover=await readySqlAsset(db,f.account,'collection'),guideImage=await readySqlAsset(db,f.account,'guide');
   await db.query("INSERT INTO collection_media(collection_id,account_id,slot,media_id) VALUES($1,$2,'cover',$3)",[f.list,f.account,cover]);
   await db.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)',[f.ids[0],f.account,image]);
   await db.query("INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,'{}')",[recs.books,f.account]);
   await db.query("INSERT INTO book_recommendation_context(recommendation_id,account_id,buy_links) VALUES($1,$2,'[]')",[recs.books,f.account]);
   for(const slot of ['cover','thumbnail'])await db.query('INSERT INTO recommendation_book_covers(recommendation_id,account_id,slot,media_id) VALUES($1,$2,$3,$4)',[recs.books,f.account,slot,image]);
   await db.query("INSERT INTO movie_recommendation_context(recommendation_id,account_id,region,selected_provider_ids) VALUES($1,$2,'US',NULL)",[recs.movies,f.account]);
   await db.query("INSERT INTO product_recommendation_context(recommendation_id,account_id,price,currency_code,buy_url) VALUES($1,$2,0,'USD','https://example.invalid/buy')",[recs.products,f.account]);
   await db.query("INSERT INTO place_recommendation_context(recommendation_id,account_id,contact_name,contact_number) VALUES($1,$2,'Private fixture','123456')",[f.ids[0],f.account]);
   await db.query('INSERT INTO recommendation_place_photos(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)',[f.ids[0],f.account,image]);
   await db.query('INSERT INTO recommendation_app_screenshots(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)',[recs.apps,f.account,image]);
   await db.query("INSERT INTO recommendation_movie_media(recommendation_id,account_id,source_entity_id,source_external_kind,source_external_id,source_fetched_at,source_mapping_version,slot,slot_index,media_id) VALUES($1,$2,$3,'movie',$4,$5,1,'poster',0,$6)",[recs.movies,f.account,shared.movies,externalId,movieFetchedMs,image]);
   await db.query("INSERT INTO recommendation_taxonomy(recommendation_id,account_id,category,term_id,position) VALUES($1,$2,'movies',$3,0)",[recs.movies,f.account,term]);
   await db.query("INSERT INTO account_category_pin_state(account_id,category) VALUES($1,'books')",[f.account]);
   await db.query("INSERT INTO category_recommendation_pins(account_id,category,recommendation_id,collection_id,position) VALUES($1,'books',$2,$3,0)",[f.account,recs.books,lists.books]);
   await db.query("INSERT INTO place_collection_details(collection_id,account_id,location_entity_id,location_snapshot) VALUES($1,$2,$3,'{}')",[f.list,f.account,shared.places]);
   for(const category of ['products','people'])await db.query('INSERT INTO collection_location_links(child_collection_id,account_id,child_category,location_collection_id) VALUES($1,$2,$3,$4)',[lists[category],f.account,category,f.list]);
   await db.query('INSERT INTO guide_collection_details(collection_id,account_id,location_entity_id) VALUES($1,$2,$3)',[lists.guides,f.account,shared.places]);
   const section=(await db.query("INSERT INTO guide_sections(collection_id,account_id,display_order,block_version,title,blocks) VALUES($1,$2,0,'guide-section-blocks/v1','Fixture section',$3::jsonb) RETURNING id",[lists.guides,f.account,JSON.stringify({photos:[{mediaId:guideImage}]})])).rows[0].id;
   f.sectionIds=[section];await db.query('INSERT INTO guide_section_photos(section_id,account_id,media_id) VALUES($1,$2,$3)',[section,f.account,guideImage]);
   const eventKey=randomUUID(),event=(await db.query("INSERT INTO analytics_events(account_id,client_event_id,event_type,page,category,collection_id,recommendation_id,occurred_at,canonical_path,consent_version) VALUES($1,$2,'view','public-books','books',$3,$4,$5,'/fixture/books/list','explorers-analytics-v1') RETURNING id",[f.account,eventKey,lists.books,recs.books,fixtureTime])).rows[0].id;
   await db.query('INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id) VALUES($1,$2,$3,$4)',[f.account,eventKey,Buffer.alloc(32,9),event]);
   await db.query('INSERT INTO analytics_event_receipts(account_id,client_event_id,input_hash,event_id,retired_at) VALUES($1,$2,$3,NULL,$4)',[f.account,randomUUID(),Buffer.alloc(32,10),fixtureTime]);
  }
 },{privileged:true});
 expect(result.error).toBeUndefined();expect(result.committed).toBe(true);
 const records=[...await sqlSetup(target),...await sqlSetup(foreign)];return {target,foreign,records};
}
type SqlSnapshot=Awaited<ReturnType<typeof completeSqlSnapshot>>;
function stableCommandInput(value:any):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(stableCommandInput).join(',')}]`;
 return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableCommandInput(v)}`).join(',')}}`;
}
async function recommendationSqlReceipt(account:string,operation:string,input:unknown,key:string,response:unknown,before:SqlSnapshot){
 const rows=(await admin.query('SELECT * FROM application_command_receipts WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3',[account,operation,createHash('sha256').update(key).digest()])).rows;
 expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({account_id:account,operation,status:'completed',idempotency_key_hash:createHash('sha256').update(key).digest(),request_hash:createHash('sha256').update(stableCommandInput(input)).digest(),response});
 const result=response as {id:string;revision:number},table=operation==='reorderCollection'?'collections':'recommendations',durable=(await admin.query(`SELECT * FROM ${table} WHERE id=$1 AND account_id=$2`,[result.id,account])).rows;
 expect(durable).toHaveLength(1);expect(response).toMatchObject({id:durable[0].id,accountId:account,category:durable[0].category,revision:Number(durable[0].revision)});
 const all=(await admin.query('SELECT * FROM application_command_receipts WHERE account_id=ANY($1::uuid[]) ORDER BY id',[[...new Set(before.receipts.map(r=>r.account_id)),account]])).rows;
 expect(all.filter(row=>row.id!==rows[0].id)).toEqual(before.receipts);expect(all).toHaveLength(before.receipts.length+1);return rows[0];
}
function unchangedSqlFields(before:SqlSnapshot,after:SqlSnapshot,except:(keyof SqlSnapshot)[]){
 for(const key of Object.keys(before) as (keyof SqlSnapshot)[])if(!except.includes(key))expect(after[key],key).toEqual(before[key]);
}
function categoryStatementDelta(before:SqlSnapshot,after:SqlSnapshot,account:string,category:string,delta:number){
 expect(after.categories).toEqual(before.categories.map(row=>row.account_id===account&&row.category===category?{...row,revision:String(BigInt(row.revision)+BigInt(delta))}:row));
}
async function historicalSqlFixture(category:'books'|'games'|'apps'){
 const f=await seed(2),foreign=await seed(1),records=[...await sqlSetup(f),...await sqlSetup(foreign)],kind={books:'book',games:'game',apps:'app'}[category];
 const list=(await admin.query('INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,$2,$3,$4,0) RETURNING id',[f.account,category,'Historical fixture',randomUUID()])).rows[0].id;
 const ids:string[]=[],entities:string[]=[];
 for(let i=0;i<3;i++){
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES($1,'Historical bare fixture','manual') RETURNING id",[kind])).rows[0].id;entities.push(entity);
  if(i<2){const id=(await admin.query('INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,$2,$3) RETURNING id',[f.account,category,entity])).rows[0].id;ids.push(id);await admin.query('INSERT INTO collection_items(collection_id,recommendation_id,account_id,category,display_order) VALUES($1,$2,$3,$4,$5)',[list,id,f.account,category,i]);}
 }
 f.allLists=[f.list,f.otherList,list];f.allIds=[...f.ids,...ids];f.entityIds=entities;return {f,foreign,records,list,ids,entity:entities[2]};
}
// One checked-out client, actual SQLSTATE, and actual xid. Admin reads only after release.
async function rawSqlTransaction(mutate:(db:pg.PoolClient)=>Promise<void>,options:{privileged?:boolean;rollback?:boolean}={}){
 const db=await (options.privileged?admin:runtime).connect();let xid:string|undefined,error:unknown,drained=false,committed=false;
 try{
  await db.query('BEGIN');xid=(await db.query('SELECT pg_current_xact_id()::text xid')).rows[0].xid;
  await mutate(db);await db.query('SET CONSTRAINTS ALL IMMEDIATE');drained=true;
  if(!options.rollback){await db.query('COMMIT');committed=true;}
 }catch(caught){error=caught;}finally{try{if(!committed)await db.query('ROLLBACK');}finally{db.release();}}
 expect(xid).toBeDefined();
 expect((await admin.query('SELECT * FROM places_pin_validation_dirty WHERE validation_xid=$1::xid8',[xid])).rows).toEqual([]);
 expect((await admin.query('SELECT * FROM places_chunk_validation_dirty WHERE validation_xid=$1::xid8',[xid])).rows).toEqual([]);
 return {xid:xid!,error,code:(error as {code?:string}|undefined)?.code,drained,committed};
}
async function rejectRawSql(fixtures:Fixture[],records:SqlSetup[],mutate:(db:pg.PoolClient)=>Promise<void>,codes:string[],extraEntities:string[]=[]){
 const before=await completeSqlSnapshot(fixtures,records,extraEntities),result=await rawSqlTransaction(mutate);
 expect(result.committed).toBe(false);expect(result.error).toBeDefined();expect(codes).toContain(result.code);
 expect(await completeSqlSnapshot(fixtures,records,extraEntities)).toEqual(before);
}
function unchangedSqlChildren(before:SqlSnapshot,after:SqlSnapshot){
 for(const key of ['drafts','chunks','items','receipts','exactReceipts','pinQueue','chunkQueue'] as const)expect(after[key]).toEqual(before[key]);
}
function sqlCategoryDelta(before:SqlSnapshot,after:SqlSnapshot,account:string,xid:string){
 expect(after.categories).toEqual(before.categories.map(row=>row.account_id===account&&row.category==='places'?{...row,revision:String(BigInt(row.revision)+1n),places_last_mutation_xid:xid}:row));
}
function sqlCollectionDelta(before:SqlSnapshot,after:SqlSnapshot,affected:string[],xid:string,claimsPins=true){
 expect(after.collections).toHaveLength(before.collections.length);
 for(const row of before.collections){const current=after.collections.find(r=>r.id===row.id);expect(current).toBeDefined();
  if(affected.includes(row.id)){
   expect(current).toEqual({...row,revision:String(BigInt(row.revision)+1n),updated_at:current.updated_at});
   expect(current.updated_at.getTime()).toBeGreaterThanOrEqual(row.updated_at.getTime());
  }else expect(current).toEqual(row);
 }
 expect(after.markers).toEqual(before.markers.map(row=>claimsPins&&affected.includes(row.collection_id)?{...row,last_mutation_xid:xid}:row));
}
function commitRequest(f:Fixture,draftId:string,ids:string[]):Extract<PlacePinsRequest,{operation:'commitPlacePinsDraft'}>{const hash=createPlacePinsSequenceHasher();hash.append(ids);return {operation:'commitPlacePinsDraft',collectionId:f.list,draftId,body:{totalCount:ids.length,sequenceHash:hash.finish()}};}
function appendRequest(f:Fixture,draftId:string,ids:string[]):Extract<PlacePinsRequest,{operation:'appendPlacePinsChunk'}>{return {operation:'appendPlacePinsChunk',collectionId:f.list,draftId,chunkIndex:0,body:{recommendationIds:ids,chunkHash:hashPlacePinsChunk(0,ids)}};}
async function resultVersions(f:Fixture,result:any){const persisted=await versions(f);expect(result).toMatchObject({collectionRevision:persisted.collection,categoryContentRevision:String(persisted.category)});}
async function terminal(f:Fixture,draftId:string,state:string){const s=await snapshot(f,[draftId]);expect(s.drafts).toHaveLength(1);expect(s.drafts[0]).toMatchObject({state,accepted_bytes:'0',item_count:'0',chunk_count:'0'});expect(s.chunks).toEqual([]);expect(s.items).toEqual([]);}
type Fault={matches:(sql:string,args:unknown[])=>boolean;after:boolean};
// Every statement and result is real. Only the selected one-shot transport fault is synthetic.
function faultRepository(fault:Fault){
 const observed:string[]=[];let fired=false;
 const pool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args:unknown[]=[])=>{
  const hit=!fired&&fault.matches(sql,args);
  if(hit&&!fault.after){fired=true;throw new Error('Fixture rollback injection');}
  const result=await db.query(sql,args);observed.push(sql);
  if(hit){fired=true;throw new Error('Fixture rollback injection');}return result;
 },release:()=>db.release()};}} as unknown as pg.Pool;
 return {repository:new ExplorersPlacePinsRepository(pool),observed,didFire:()=>fired};
}
async function injected(f:Fixture,request:PlacePinsRequest,key:string,adapter:ReturnType<typeof faultRepository>,context:{requestId:string;idempotencyKey:string},activePolicy=policy){
 const before=await snapshot(f,'draftId' in request?[request.draftId]:[]),priorReceipt=await receipt(f,request,key);expect(priorReceipt).toEqual([]);
 await expect(adapter.repository.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),activePolicy)).rejects.toThrow('Fixture rollback injection');
 expect(adapter.didFire()).toBe(true);expect(await snapshot(f,'draftId' in request?[request.draftId]:[])).toEqual(before);expect(await receipt(f,request,key)).toEqual(priorReceipt);
}
async function appendRetry(f:Fixture,request:Extract<PlacePinsRequest,{operation:'appendPlacePinsChunk'}>,key:string,context:{requestId:string;idempotencyKey:string}){
 const bytes=Buffer.byteLength(JSON.stringify(request))+64*request.body.recommendationIds.length;
 const ack=await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy);
 expect(ack).toMatchObject({draftId:request.draftId,chunkIndex:0,chunkHash:request.body.chunkHash,acceptedCount:request.body.recommendationIds.length,changed:true});
 const charged=await snapshot(f,[request.draftId]);expect(charged.drafts[0]).toMatchObject({state:'open',accepted_bytes:String(bytes),item_count:String(request.body.recommendationIds.length),chunk_count:'1'});
 expect(charged.chunks).toHaveLength(1);expect(charged.chunks[0]).toMatchObject({chunk_index:'0',hash:Buffer.from(request.body.chunkHash,'hex'),item_count:String(request.body.recommendationIds.length),admitted_bytes:String(bytes),acknowledgement:ack});
 expect(charged.items.map(row=>({id:row.recommendation_id,chunk:Number(row.chunk_index),index:Number(row.item_index)}))).toEqual(request.body.recommendationIds.map((id,index)=>({id,chunk:0,index})));expect(await receipt(f,request,key)).toHaveLength(1);
 expect(await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy)).toEqual(ack);
 // Fresh receipt key reaches the immutable chunk acknowledgement branch.
 expect(await command(f,request,randomUUID())).toEqual(ack);expect(await snapshot(f,[request.draftId])).toEqual(charged);
}
async function waitBlockedBy(pid:number){const deadline=performance.now()+5000;
 while(performance.now()<deadline){if((await admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) LIMIT 1',[pid])).rowCount)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected actual PostgreSQL barrier');}
async function waitDatabaseCondition(sql:string,args:unknown[]){const deadline=performance.now()+2000;
 while(performance.now()<deadline){if((await admin.query(sql,args)).rows[0]?.ready)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected bounded database clock condition');}
// Read-only adapter: SQL, arguments, results and release all pass through unchanged.
function observingRepository(){
 const observations:{sql:string;args:unknown[];rows:any[];rowCount:number|null}[]=[];let releases=0;
 const pool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args:unknown[]=[])=>{
  const result=await db.query(sql,args);observations.push({sql,args,rows:result.rows,rowCount:result.rowCount});return result;
 },release:()=>{releases++;db.release();}};}} as unknown as pg.Pool;
 return {repository:new ExplorersPlacePinsRepository(pool),observations,releases:()=>releases};
}
const databaseClock=async()=>((await admin.query('SELECT clock_timestamp() now')).rows[0].now as Date).getTime();
 it.each(['bytes','work'] as const)('rolls back late cumulative staged processing %s exhaustion after promotion and result reads',async(kind)=>{
  const f=await seed(3);await replace(f);const ids=[...f.ids].reverse(),draftIdLength=randomUUID();
  const shape=(id:string,index:number,members:string[]):PlacePinsRequest=>({operation:'appendPlacePinsChunk',collectionId:f.list,draftId:id,chunkIndex:index,body:{recommendationIds:members,chunkHash:hashPlacePinsChunk(index,members)}});
  const B0=Buffer.byteLength(JSON.stringify(shape(draftIdLength,0,ids.slice(0,2)))),B1=Buffer.byteLength(JSON.stringify(shape(draftIdLength,1,ids.slice(2)))),S=B0+B1+3*64;
  expect(B0).toBeLessThanOrEqual(512);expect(B1).toBeLessThanOrEqual(512);expect(S).toBeGreaterThanOrEqual(512);
  // 24 controlled queries + 2 stream loops + 23 explicit charges = 49;
  // terminal admission takes bytes S+1152 -> S+1344 and work 49 -> 54.
  const P={...policy,policyId:`disposable-late-${kind}`,transportChunkBytes:512,transportChunkIds:8,replacementBytes:512,replacementIds:8,ownerStagingBytes:S,commitProcessingBytes:kind==='bytes'?S+1152:200000,commitWorkUnits:kind==='work'?53:10000};
  const adapter=observingRepository(),execute=(request:PlacePinsRequest,key:string,p=P)=>adapter.repository.execute(f.account,request,{requestId:randomUUID(),idempotencyKey:key},Buffer.byteLength(JSON.stringify(request)),p);
  const start:PlacePinsRequest={operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)},startKey=randomUUID(),draft:any=await execute(start,startKey);
  const first=shape(draft.draftId,0,ids.slice(0,2)),second=shape(draft.draftId,1,ids.slice(2)),firstKey=randomUUID(),secondKey=randomUUID();
  expect(Buffer.byteLength(JSON.stringify(first))).toBe(B0);expect(Buffer.byteLength(JSON.stringify(second))).toBe(B1);
  await execute(first,firstKey);await execute(second,secondKey);
  expect(adapter.observations.filter(o=>o.sql.startsWith('INSERT INTO place_pin_draft_chunks'))).toHaveLength(2);
  const before=await snapshot(f,[draft.draftId]);expect(before.drafts[0]).toMatchObject({policy_snapshot:P,accepted_bytes:String(S),item_count:'3',chunk_count:'2'});
  const setup=()=>Promise.all([receipt(f,start,startKey),receipt(f,first,firstKey),receipt(f,second,secondKey)]),saved=await setup();
  const request=commitRequest(f,draft.draftId,ids),key=randomUUID(),Q={...policy,policyId:'disposable-late-generous-caller',policyVersion:2};
  for(const caller of [P,Q]){
   const offset=adapter.observations.length,releases=adapter.releases();await expect(execute(request,key,caller)).rejects.toMatchObject({status:413});
   const sql=adapter.observations.slice(offset).map(o=>o.sql),controlled=sql.filter(s=>s!=='BEGIN'&&s!=='ROLLBACK'&&!s.startsWith('SELECT set_config('));
   expect(controlled).toHaveLength(24);expect(sql.filter(s=>s.startsWith('INSERT INTO collection_place_pins'))).toHaveLength(1);
   expect(controlled.slice(-3).map(s=>s.replace(/\s+/g,' '))).toEqual([
    expect.stringContaining('SELECT revision FROM collections'),expect.stringContaining('SELECT count(*)'),expect.stringContaining('FROM account_category_content_state')]);
   expect(sql.some(s=>s.startsWith('UPDATE place_pin_drafts SET state='))).toBe(false);expect(sql.some(s=>s.startsWith('DELETE FROM place_pin_draft_chunks'))).toBe(false);
   expect(sql.some(s=>s.startsWith('INSERT INTO application_command_receipts'))).toBe(false);expect(sql.filter(s=>s==='ROLLBACK')).toHaveLength(1);expect(adapter.releases()).toBe(releases+1);
   expect(await snapshot(f,[draft.draftId])).toEqual(before);expect(await setup()).toEqual(saved);expect(await receipt(f,request,key)).toEqual([]);
  }
  const control=await seed(3);await replace(control);const controlBefore=await versions(control),other=await versions(control,control.otherList),reverse=[...control.ids].reverse();
  const generous={...P,policyId:`disposable-late-${kind}-control`,commitProcessingBytes:200000,commitWorkUnits:10000};
  const opened=await command(control,{operation:'beginPlacePinsDraft',collectionId:control.list,body:await fences(control)},randomUUID(),generous);
  for(const [index,members] of [reverse.slice(0,2),reverse.slice(2)].entries())await command(control,{operation:'appendPlacePinsChunk',collectionId:control.list,draftId:opened.draftId,chunkIndex:index,body:{recommendationIds:members,chunkHash:hashPlacePinsChunk(index,members)}},randomUUID(),generous);
  expect(await command(control,commitRequest(control,opened.draftId,reverse),randomUUID(),generous)).toMatchObject({changed:true,pinCount:3});
  expect(await live(control)).toEqual(reverse.map((id,position)=>({id,position})));expect(await versions(control)).toEqual({collection:controlBefore.collection+1,category:controlBefore.category+1n});expect((await versions(control,control.otherList)).collection).toBe(other.collection);
 });
 it.each(['committed','aborted','expired'] as const)('preserves original draft policy and independent receipts through %s terminalization',async(state)=>{
  const f=await seed(3);await replace(f);const ids=[...f.ids].reverse(),content=await snapshot(f),before=await versions(f);
  const P={...policy,policyId:`disposable-original-${state}`,transportChunkBytes:512,transportChunkIds:8,replacementBytes:512,replacementIds:8,draftExpiryMs:1000,stagingRetentionMs:1500,receiptRetentionMs:20000};
  const Q={...policy,policyId:`disposable-caller-${state}`,policyVersion:2,transportChunkBytes:8192,transportChunkIds:64,replacementBytes:8192,replacementIds:64,ownerStagingBytes:200000};
  const shared=randomUUID(),start:PlacePinsRequest={operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)};
  const records:{request:PlacePinsRequest;key:ReturnType<typeof randomUUID>;context:{requestId:string;idempotencyKey:string};response:any;rows:any[];lower:number;upper:number}[]=[];
  const write=async(request:PlacePinsRequest,key:ReturnType<typeof randomUUID>,caller=Q)=>{const context={requestId:randomUUID(),idempotencyKey:key},lower=await databaseClock(),response=await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),caller),upper=await databaseClock(),rows=await receipt(f,request,key);expect(rows).toHaveLength(1);
   const until=(rows[0].replay_until as Date).getTime();expect(until).toBeGreaterThanOrEqual(lower+P.receiptRetentionMs-1);expect(until).toBeLessThanOrEqual(upper+P.receiptRetentionMs+1);expect(until).toBeLessThan(lower+Q.receiptRetentionMs);
   expect(rows[0]).toMatchObject({status:'completed',request_hash:Buffer.from(hashPlacePinsRequest(request),'hex'),idempotency_key_hash:createHash('sha256').update(key).digest(),response});records.push({request,key,context,response,rows,lower,upper});return response as any;};
  const draft=await write(start,shared,P),original=(await snapshot(f,[draft.draftId])).drafts[0];
  expect(original).toMatchObject({policy_snapshot:P,policy_id:P.policyId,policy_version:String(P.policyVersion),expected_collection_revision:String(start.body.expectedCollectionRevision),expected_category_content_revision:start.body.expectedCategoryContentRevision});expect(original.expires_at.toISOString()).toBe(draft.expiresAt);
  const first:PlacePinsRequest={...appendRequest(f,draft.draftId,ids.slice(0,2))},second:PlacePinsRequest={operation:'appendPlacePinsChunk',collectionId:f.list,draftId:draft.draftId,chunkIndex:1,body:{recommendationIds:ids.slice(2),chunkHash:hashPlacePinsChunk(1,ids.slice(2))}};
  const rejected=appendRequest(f,draft.draftId,[ids[0]]),rejectedKey=randomUUID(),initial=await snapshot(f,[draft.draftId]);
  expect(P.transportChunkBytes).toBeLessThan(513);expect(Q.transportChunkBytes).toBeGreaterThan(513);
  await expect(repo.execute(f.account,rejected,{requestId:randomUUID(),idempotencyKey:rejectedKey},513,Q)).rejects.toMatchObject({status:413});expect(await snapshot(f,[draft.draftId])).toEqual(initial);expect(await receipt(f,rejected,rejectedKey)).toEqual([]);
  await write(first,shared);await write(second,randomUUID());
  const staged=await snapshot(f,[draft.draftId]);for(const field of ['policy_snapshot','policy_id','policy_version','expected_collection_revision','expected_category_content_revision','expires_at','created_at'])expect(staged.drafts[0][field]).toEqual(original[field]);
  expect(await databaseClock()).toBeLessThan(original.expires_at.getTime());
  if(state==='committed'){const result=await write(commitRequest(f,draft.draftId,ids),shared);expect(result).toMatchObject({changed:true,pinCount:3});expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));}
  else if(state==='aborted')expect(await write({operation:'abortPlacePinsDraft',collectionId:f.list,draftId:draft.draftId,body:{}},shared)).toMatchObject({changed:true});
  else{await waitDatabaseCondition('SELECT expires_at<=clock_timestamp() ready FROM place_pin_drafts WHERE id=$1',[draft.draftId]);const key=randomUUID();await expect(command(f,rejected,key,Q)).rejects.toMatchObject({status:409});expect(await receipt(f,rejected,key)).toEqual([]);await repo.cleanupExpired(Q);}
  await terminal(f,draft.draftId,state);const finished=await snapshot(f,[draft.draftId]);
  for(const field of ['policy_snapshot','policy_id','policy_version','expected_collection_revision','expected_category_content_revision','expires_at','created_at'])expect(finished.drafts[0][field]).toEqual(original[field]);
  if(state!=='committed'){expect(finished.pins).toEqual(content.pins);expect(finished.collections).toEqual(content.collections);expect(finished.categories).toEqual(content.categories);}else{expect(finished.collections.find(r=>r.id===f.otherList)).toEqual(content.collections.find(r=>r.id===f.otherList));}
  const replay=async(expected:Awaited<ReturnType<typeof snapshot>>)=>{for(const record of records){expect(await repo.execute(f.account,record.request,record.context,Buffer.byteLength(JSON.stringify(record.request)),Q)).toEqual(record.response);expect(await receipt(f,record.request,record.key)).toEqual(record.rows);}expect(await snapshot(f,[draft.draftId])).toEqual(expected);};
  await replay(finished);
  const altered=appendRequest(f,draft.draftId,[ids[1]]);await expect(command(f,altered,shared,Q)).rejects.toMatchObject({status:409});expect(await snapshot(f,[draft.draftId])).toEqual(finished);
  const fresh=randomUUID();await expect(command(f,first,fresh,Q)).rejects.toMatchObject({status:409});expect(await receipt(f,first,fresh)).toEqual([]);await replay(finished);
  expect(new Set(records.map(r=>`${r.request.operation}:${r.rows[0].idempotency_key_hash.toString('hex')}`)).size).toBe(records.length);
  await waitDatabaseCondition(`SELECT d.terminal_at+interval '1500 milliseconds'<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM application_command_receipts r WHERE r.account_id=d.account_id AND r.replay_until<=clock_timestamp()) ready FROM place_pin_drafts d WHERE d.id=$1`,[draft.draftId]);
  await repo.cleanupExpired(Q);const removed=await snapshot(f,[draft.draftId]);expect(removed.drafts).toEqual([]);expect(removed.pins).toEqual(finished.pins);expect(removed.collections).toEqual(finished.collections);expect(removed.categories).toEqual(finished.categories);await replay(removed);
 });
 it('supports >15, ordered replacement, no-op, replay and zero clear with exact deltas',async()=>{
  const f=await seed(20),before=await versions(f),key=randomUUID(),body={...await fences(f),orderedRecommendationIds:f.ids};
  const request={operation:'replacePlacePins' as const,collectionId:f.list,body};
  expect(await command(f,request,key)).toMatchObject({changed:true,pinCount:20});
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});
  expect(await command(f,request,key)).toMatchObject({changed:true,pinCount:20});
  const after=await versions(f);expect(await replace(f)).toMatchObject({changed:false,pinCount:20});expect(await versions(f)).toEqual(after);
  expect(await replace(f,[])).toMatchObject({changed:true,pinCount:0});expect(await versions(f)).toEqual({collection:after.collection+1,category:after.category+1n});
 });
 it('commits out-of-order multichunk staging with immutable acknowledgement replay',async()=>{
  const f=await seed(70),draft=await begin(f),before=await versions(f);
  await append(f,draft.draftId,2,f.ids.slice(64));const ack=await append(f,draft.draftId,0,f.ids.slice(0,32));
  expect(await append(f,draft.draftId,0,f.ids.slice(0,32))).toEqual(ack);
  await expect(append(f,draft.draftId,0,f.ids.slice(1,33))).rejects.toMatchObject({status:409});
  await append(f,draft.draftId,1,f.ids.slice(32,64));expect(await versions(f)).toEqual(before);
  const result=await commit(f,draft.draftId,f.ids);expect(result).toMatchObject({pinCount:70,changed:true});
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});await resultVersions(f,result);
  expect(await live(f)).toEqual(f.ids.map((id,position)=>({id,position})));await terminal(f,draft.draftId,'committed');
 });
 it('commits staged reorder and staged no-op with exact content revision deltas',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),before=await versions(f),otherBefore=await versions(f,f.otherList);
  const draft=await begin(f);await append(f,draft.draftId,0,ids);const result=await commit(f,draft.draftId,ids);
  expect(result).toMatchObject({changed:true,pinCount:3});expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});await resultVersions(f,result);
  expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect((await versions(f,f.otherList)).collection).toBe(otherBefore.collection);await terminal(f,draft.draftId,'committed');
  const after=await versions(f),next=await begin(f);await append(f,next.draftId,0,ids);const noop=await commit(f,next.draftId,ids);
  expect(noop).toMatchObject({changed:false,pinCount:3});expect(await versions(f)).toEqual(after);await resultVersions(f,noop);
  expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect((await versions(f,f.otherList)).collection).toBe(otherBefore.collection);await terminal(f,next.draftId,'committed');
 });
 it('replays the original staged commit after a lost response and retained draft removal',async()=>{
  const f=await seed(3),P={...policy,policyId:'disposable-lost-commit-response-fixture',policyVersion:1,draftExpiryMs:1000,stagingRetentionMs:1500,receiptRetentionMs:180000};
  const replaceRequest:PlacePinsRequest={operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}},replaceKey=randomUUID();
  await command(f,replaceRequest,replaceKey,P);const beforeVersions=await versions(f),otherBefore=await versions(f,f.otherList),ids=[...f.ids].reverse();
  const beginRequest:PlacePinsRequest={operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)},beginKey=randomUUID(),draft=await command(f,beginRequest,beginKey,P);
  const first:PlacePinsRequest={operation:'appendPlacePinsChunk',collectionId:f.list,draftId:draft.draftId,chunkIndex:0,body:{recommendationIds:ids.slice(0,2),chunkHash:hashPlacePinsChunk(0,ids.slice(0,2))}},firstKey=randomUUID();
  const second:PlacePinsRequest={operation:'appendPlacePinsChunk',collectionId:f.list,draftId:draft.draftId,chunkIndex:1,body:{recommendationIds:ids.slice(2),chunkHash:hashPlacePinsChunk(1,ids.slice(2))}},secondKey=randomUUID();
  await command(f,first,firstKey,P);await command(f,second,secondKey,P);
  const setup=()=>Promise.all([receipt(f,replaceRequest,replaceKey),receipt(f,beginRequest,beginKey),receipt(f,first,firstKey),receipt(f,second,secondKey)]);
  const setupReceipts=await setup(),staged=await snapshot(f,[draft.draftId]);expect(setupReceipts.every(rows=>rows.length===1)).toBe(true);
  expect(staged.drafts).toHaveLength(1);expect(staged.drafts[0]).toMatchObject({state:'open',item_count:'3',chunk_count:'2',policy_snapshot:P});expect(staged.chunks).toHaveLength(2);expect(staged.items).toHaveLength(3);
  const request=commitRequest(f,draft.draftId,ids),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key},lostResponse=new Error('Fixture lost commit response');
  let fired=false,completedFinalBatches=0,released=false;const observed:string[]=[];
  // Forward the actual final simple-protocol COMMIT before losing its response.
  const pool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args?:unknown[])=>{
   const final=sql.includes('DO $places_deadline$')&&sql.includes('SET CONSTRAINTS ALL IMMEDIATE')&&sql.includes('DO $places_completion$')&&/COMMIT;\s*$/.test(sql);
   const result=await db.query(sql,args);observed.push(sql);
   if(final){completedFinalBatches++;if(!fired){fired=true;throw lostResponse;}}return result;
  },release:()=>{db.release();released=true;}};}} as unknown as pg.Pool;
  expect(await receipt(f,request,key)).toEqual([]);
  await expect(new ExplorersPlacePinsRepository(pool).execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),P)).rejects.toBe(lostResponse);
  expect(fired).toBe(true);expect(completedFinalBatches).toBe(1);expect(observed.at(-1)).toBe('ROLLBACK');expect(released).toBe(true);
  const committed=await snapshot(f,[draft.draftId]),originalReceipt=await receipt(f,request,key);await terminal(f,draft.draftId,'committed');
  expect(originalReceipt).toHaveLength(1);expect(originalReceipt[0]).toMatchObject({status:'completed',request_hash:Buffer.from(hashPlacePinsRequest(request),'hex')});
  const original=originalReceipt[0].response;expect(original).toMatchObject({changed:true,pinCount:3});expect(committed.drafts[0].terminal_result).toEqual(original);await resultVersions(f,original);
  expect(await versions(f)).toEqual({collection:beforeVersions.collection+1,category:beforeVersions.category+1n});expect((await versions(f,f.otherList)).collection).toBe(otherBefore.collection);
  expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(committed.pins.filter(row=>row.collection_id===f.otherList)).toEqual(staged.pins.filter(row=>row.collection_id===f.otherList));expect(await setup()).toEqual(setupReceipts);
  expect(committed.drafts[0].expected_collection_revision).toBe(String(beginRequest.body.expectedCollectionRevision));expect(committed.drafts[0].expected_category_content_revision).toBe(beginRequest.body.expectedCategoryContentRevision);
  expect(Number(committed.drafts[0].expected_collection_revision)).toBeLessThan(original.collectionRevision);expect(BigInt(committed.drafts[0].expected_category_content_revision)).toBeLessThan(BigInt(original.categoryContentRevision));
  const replay=()=>repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),P);
  expect(await replay()).toEqual(original);expect(await snapshot(f,[draft.draftId])).toEqual(committed);expect(await receipt(f,request,key)).toEqual(originalReceipt);expect(await setup()).toEqual(setupReceipts);
  const changed={...request,body:{...request.body,totalCount:request.body.totalCount+1}};
  await expect(repo.execute(f.account,changed,context,Buffer.byteLength(JSON.stringify(changed)),P)).rejects.toMatchObject({status:409});
  expect(await snapshot(f,[draft.draftId])).toEqual(committed);expect(await receipt(f,request,key)).toEqual(originalReceipt);expect(await setup()).toEqual(setupReceipts);
  await waitDatabaseCondition(`SELECT d.terminal_at+(d.policy_snapshot->>'stagingRetentionMs')::bigint*interval '1 millisecond'<=clock_timestamp() AND r.replay_until>clock_timestamp() ready
   FROM place_pin_drafts d JOIN application_command_receipts r ON r.account_id=d.account_id AND r.operation=$2 AND r.idempotency_key_hash=$3 WHERE d.id=$1`,[draft.draftId,request.operation,createHash('sha256').update(key).digest()]);
  await repo.cleanupExpired(P);
  const removed=await snapshot(f,[draft.draftId]);expect(removed).toEqual({...committed,drafts:[],chunks:[],items:[]});
  // Query original child identity explicitly after the parent is physically absent.
  expect((await admin.query('SELECT 1 FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rowCount).toBe(0);
  expect((await admin.query('SELECT 1 FROM place_pin_draft_chunks WHERE draft_id=$1',[draft.draftId])).rowCount).toBe(0);expect((await admin.query('SELECT 1 FROM place_pin_draft_items WHERE draft_id=$1',[draft.draftId])).rowCount).toBe(0);
  expect(await receipt(f,request,key)).toEqual(originalReceipt);expect(await setup()).toEqual(setupReceipts);
  expect(await replay()).toEqual(original);expect(await snapshot(f,[draft.draftId])).toEqual(removed);expect(await receipt(f,request,key)).toEqual(originalReceipt);expect(await setup()).toEqual(setupReceipts);
 });
 it('rejects wrong staged total count without changing live staging or receipts',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),draft=await begin(f);await append(f,draft.draftId,0,ids);
  const correct=commitRequest(f,draft.draftId,ids),request={...correct,body:{...correct.body,totalCount:ids.length+1}},key=randomUUID(),before=await snapshot(f,[draft.draftId]);
  expect(await receipt(f,request,key)).toEqual([]);await expect(command(f,request,key)).rejects.toMatchObject({status:422});expect(await snapshot(f,[draft.draftId])).toEqual(before);expect(await receipt(f,request,key)).toEqual([]);
  const result=await command(f,correct,key);expect(result).toMatchObject({changed:true,pinCount:3});await resultVersions(f,result);expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(await receipt(f,correct,key)).toHaveLength(1);await terminal(f,draft.draftId,'committed');
 });
 it('rejects wrong staged sequence hash without changing live staging or receipts',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),draft=await begin(f);await append(f,draft.draftId,0,ids);
  const correct=commitRequest(f,draft.draftId,ids),wrongHash=(correct.body.sequenceHash[0]==='0'?'1':'0')+correct.body.sequenceHash.slice(1);
  const request={...correct,body:{...correct.body,sequenceHash:wrongHash}},key=randomUUID(),before=await snapshot(f,[draft.draftId]);expect(wrongHash).toMatch(/^[0-9a-f]{64}$/);expect(wrongHash).not.toBe(correct.body.sequenceHash);
  expect(await receipt(f,request,key)).toEqual([]);await expect(command(f,request,key)).rejects.toMatchObject({status:422});expect(await snapshot(f,[draft.draftId])).toEqual(before);expect(await receipt(f,request,key)).toEqual([]);
  const result=await command(f,correct,key);expect(result).toMatchObject({changed:true,pinCount:3});await resultVersions(f,result);expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(await receipt(f,correct,key)).toHaveLength(1);await terminal(f,draft.draftId,'committed');
 });
 it('rolls back staged promotion when failure follows live pin insertion',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),draft=await begin(f);await append(f,draft.draftId,0,ids);
  const request=commitRequest(f,draft.draftId,ids),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key},before=await versions(f);
  const adapter=faultRepository({after:true,matches:(sql,args)=>sql.startsWith('INSERT INTO collection_place_pins')&&sql.includes('FROM place_pin_draft_items WHERE draft_id=$3')&&args[2]===draft.draftId});
  await injected(f,request,key,adapter,context);expect(adapter.observed.some(sql=>sql.startsWith('DELETE FROM collection_place_pins'))).toBe(true);expect(adapter.observed.some(sql=>sql.startsWith('INSERT INTO collection_place_pins'))).toBe(true);
  const result=await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy);expect(result).toMatchObject({changed:true,pinCount:3});await resultVersions(f,result);
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(await receipt(f,request,key)).toHaveLength(1);await terminal(f,draft.draftId,'committed');
 });
 it('rolls back staged promotion when terminal result persistence fails',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),draft=await begin(f);await append(f,draft.draftId,0,ids);
  const request=commitRequest(f,draft.draftId,ids),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key},before=await versions(f);
  const adapter=faultRepository({after:false,matches:(sql,args)=>sql.startsWith('UPDATE place_pin_drafts SET state=$2,terminal_at=')&&args[0]===draft.draftId&&args[1]==='committed'});
  await injected(f,request,key,adapter,context);const insertion=adapter.observed.findIndex(sql=>sql.startsWith('INSERT INTO collection_place_pins'));
  expect(insertion).toBeGreaterThan(-1);expect(adapter.observed.slice(insertion+1)).toEqual(expect.arrayContaining(['SELECT revision FROM collections WHERE id=$1 AND account_id=$2','SELECT count(*)::text AS count FROM collection_place_pins WHERE collection_id=$1']));
  expect(adapter.observed.slice(insertion+1).some(sql=>sql.startsWith('SELECT coalesce((SELECT revision::text FROM account_category_content_state'))).toBe(true);
  const result=await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy);expect(result).toMatchObject({changed:true,pinCount:3});await resultVersions(f,result);
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(await receipt(f,request,key)).toHaveLength(1);await terminal(f,draft.draftId,'committed');
 });
 it('rejects owner staging byte overflow without charging either draft',async()=>{
  const f=await seed(8);await replace(f);const contentBefore=await versions(f),liveBefore=await live(f);
  // Two 8-ID chunks fit 1024 transport bytes individually; their accounted bytes
  // each fit the 1400-byte owner quota but exceed it together. Both begins freeze it.
  const quota={...policy,policyId:'disposable-owner-byte-fixture',transportChunkBytes:1024,transportChunkIds:8,replacementBytes:1024,replacementIds:8,ownerStagingBytes:1400};
  const beginRequest:PlacePinsRequest={operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)},firstBeginKey=randomUUID(),secondBeginKey=randomUUID();
  const first=await command(f,beginRequest,firstBeginKey,quota);
  const second=await command(f,beginRequest,secondBeginKey,quota);
  const firstRequest=appendRequest(f,first.draftId,f.ids),request=appendRequest(f,second.draftId,[...f.ids].reverse()),key=randomUUID();
  const firstBytes=Buffer.byteLength(JSON.stringify(firstRequest))+64*f.ids.length,secondBytes=Buffer.byteLength(JSON.stringify(request))+64*f.ids.length;
  expect(Buffer.byteLength(JSON.stringify(firstRequest))).toBeLessThanOrEqual(quota.transportChunkBytes);expect(Buffer.byteLength(JSON.stringify(request))).toBeLessThanOrEqual(quota.transportChunkBytes);
  expect(firstBytes).toBeLessThanOrEqual(quota.ownerStagingBytes);expect(secondBytes).toBeLessThanOrEqual(quota.ownerStagingBytes);expect(firstBytes+secondBytes).toBeGreaterThan(quota.ownerStagingBytes);
  const firstKey=randomUUID();await command(f,firstRequest,firstKey,quota);const before=await snapshot(f,[first.draftId,second.draftId]);expect(before.drafts).toHaveLength(2);
  expect(before.drafts.find(row=>row.id===first.draftId)).toMatchObject({accepted_bytes:String(firstBytes),item_count:'8',chunk_count:'1',policy_snapshot:quota});expect(before.drafts.find(row=>row.id===second.draftId)).toMatchObject({accepted_bytes:'0',item_count:'0',chunk_count:'0',policy_snapshot:quota});
  const setupReceipts=await Promise.all([receipt(f,beginRequest,firstBeginKey),receipt(f,beginRequest,secondBeginKey),receipt(f,firstRequest,firstKey)]);expect(setupReceipts.every(rows=>rows.length===1)).toBe(true);
  expect(await receipt(f,request,key)).toEqual([]);await expect(command(f,request,key,quota)).rejects.toMatchObject({status:413,message:'Owner staging quota exceeded'});
  expect(await snapshot(f,[first.draftId,second.draftId])).toEqual(before);expect(await receipt(f,request,key)).toEqual([]);
  expect(await Promise.all([receipt(f,beginRequest,firstBeginKey),receipt(f,beginRequest,secondBeginKey),receipt(f,firstRequest,firstKey)])).toEqual(setupReceipts);expect(await versions(f)).toEqual(contentBefore);expect(await live(f)).toEqual(liveBefore);
  await command(f,{operation:'abortPlacePinsDraft',collectionId:f.list,draftId:first.draftId,body:{}},randomUUID(),quota);await terminal(f,first.draftId,'aborted');expect(await versions(f)).toEqual(contentBefore);expect(await live(f)).toEqual(liveBefore);
  const ack=await command(f,request,key,quota),charged=await snapshot(f,[first.draftId,second.draftId]);expect(ack).toMatchObject({changed:true,acceptedCount:8});
  expect(charged.drafts.find(row=>row.id===second.draftId)).toMatchObject({state:'open',accepted_bytes:String(secondBytes),item_count:'8',chunk_count:'1',policy_snapshot:quota});
  expect(charged.drafts.every(row=>row.policy_snapshot.ownerStagingBytes===quota.ownerStagingBytes)).toBe(true);expect(charged.chunks).toHaveLength(1);expect(charged.chunks[0]).toMatchObject({admitted_bytes:String(secondBytes),acknowledgement:ack});expect(charged.items.map(row=>row.recommendation_id)).toEqual(request.body.recommendationIds);expect(await receipt(f,request,key)).toHaveLength(1);
  expect(await command(f,request,key,quota)).toEqual(ack);expect(await snapshot(f,[first.draftId,second.draftId])).toEqual(charged);expect(await versions(f)).toEqual(contentBefore);expect(await live(f)).toEqual(liveBefore);
 });
 it('rolls back append reservation when failure follows staged item insertion',async()=>{
  const f=await seed();await replace(f);const draft=await begin(f),request=appendRequest(f,draft.draftId,[...f.ids].reverse()),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key};
  const before=await versions(f),liveBefore=await live(f),adapter=faultRepository({after:true,matches:(sql,args)=>sql.startsWith('INSERT INTO place_pin_draft_items(')&&args[0]===draft.draftId&&args[1]===0&&args[2]===0});
  await injected(f,request,key,adapter,context);expect(adapter.observed.some(sql=>sql.startsWith('INSERT INTO place_pin_draft_chunks('))).toBe(true);expect(adapter.observed.some(sql=>sql.startsWith('INSERT INTO place_pin_draft_items('))).toBe(true);
  await appendRetry(f,request,key,context);expect(await versions(f)).toEqual(before);expect(await live(f)).toEqual(liveBefore);
 });
 it('rolls back append reservation when failure follows draft counter update',async()=>{
  const f=await seed();await replace(f);const draft=await begin(f),request=appendRequest(f,draft.draftId,[...f.ids].reverse()),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key};
  const before=await versions(f),liveBefore=await live(f),adapter=faultRepository({after:true,matches:(sql,args)=>sql.startsWith('UPDATE place_pin_drafts SET accepted_bytes=$2,item_count=$3,chunk_count=$4')&&args[0]===draft.draftId&&args[2]===f.ids.length&&args[3]===1});
  await injected(f,request,key,adapter,context);expect(adapter.observed.some(sql=>sql.startsWith('INSERT INTO place_pin_draft_chunks('))).toBe(true);expect(adapter.observed.filter(sql=>sql.startsWith('INSERT INTO place_pin_draft_items('))).toHaveLength(f.ids.length);expect(adapter.observed.some(sql=>sql.startsWith('UPDATE place_pin_drafts SET accepted_bytes=$2'))).toBe(true);
  await appendRetry(f,request,key,context);expect(await versions(f)).toEqual(before);expect(await live(f)).toEqual(liveBefore);
 });
 it('rejects gaps and whole-sequence duplicate identities without partial live promotion',async()=>{
  const f=await seed(),draft=await begin(f);await append(f,draft.draftId,1,[f.ids[0]]);
  await expect(commit(f,draft.draftId,[f.ids[0]])).rejects.toMatchObject({status:422});expect(await live(f)).toEqual([]);
  await append(f,draft.draftId,0,[f.ids[0]]);await expect(commit(f,draft.draftId,[f.ids[0],f.ids[0]])).rejects.toMatchObject({status:422});
  expect((await admin.query('SELECT state,item_count FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toMatchObject({state:'open',item_count:'2'});
 });
 it('retains stale original fences and staging after membership/archive content changes',async()=>{
  const f=await seed(),draft=await begin(f);await append(f,draft.draftId,0,f.ids);
  await admin.query("UPDATE collections SET title='Changed' WHERE id=$1",[f.list]);
  await expect(commit(f,draft.draftId,f.ids)).rejects.toMatchObject({status:409});
  expect((await admin.query('SELECT state,expected_category_content_revision FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'open',expected_category_content_revision:draft.expectedCategoryContentRevision});
 });
 it.each(['delete-pins-first','archive-first'])('coordinates raw %s collection archive without nested updates or double increments',async order=>{
  const f=await seed();await replace(f);const before=await versions(f);const db=await runtime.connect();
  try{await db.query('BEGIN');
   if(order==='delete-pins-first')await db.query('DELETE FROM collection_place_pins WHERE collection_id=$1',[f.list]);
   await db.query('UPDATE collections SET archived_at=clock_timestamp() WHERE id=$1',[f.list]);
   if(order==='archive-first')await db.query('DELETE FROM collection_place_pins WHERE collection_id=$1',[f.list]);
   await db.query('COMMIT');
  }finally{await db.query('ROLLBACK');db.release();}
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect(await live(f)).toEqual([]);
  expect((await admin.query('SELECT archived_at FROM collections WHERE id=$1',[f.list])).rows[0].archived_at).not.toBeNull();
 });
 it('supported recommendation archive compacts each containing list exactly once',async()=>{
  const f=await seed();await replace(f);const other={...f,list:f.otherList};await replace(other);
  const before=await versions(f),otherBefore=await versions(other);
  await new ExplorersRecommendationRepository(runtime).archiveRecommendation(f.account,f.ids[1],1,randomUUID());
  expect(await live(f)).toEqual([{id:f.ids[0],position:0},{id:f.ids[2],position:1}]);expect(await live(other)).toEqual(await live(f));
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect((await versions(other)).collection).toBe(otherBefore.collection+1);
 });
 it('retains compatible entity identity pins and privacy/unpublish pins',async()=>{
  const f=await seed();await replace(f);const replacement=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('person','Compatible fixture','manual') RETURNING id")).rows[0].id;
  const recommendations=new ExplorersRecommendationRepository(runtime);
  await recommendations.replaceRecommendationEntity(f.account,f.ids[0],1,replacement,randomUUID());expect((await live(f)).map(row=>row.id)).toEqual(f.ids);
  const v=await versions(f);await recommendations.updateCollection(f.account,f.list,v.collection,{visibility:'private',publicationState:'draft'},randomUUID());expect((await live(f)).map(row=>row.id)).toEqual(f.ids);
 });
 it('membership deletion compacts survivors and isolates another list',async()=>{
  const f=await seed(),records=await sqlSetup(f),before=await completeSqlSnapshot([f],records),otherBefore=await live(f,f.otherList),v=await versions(f);
  const result=await rawSqlTransaction(async db=>{await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[1]]);});
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  expect(await live(f)).toEqual([{id:f.ids[0],position:0},{id:f.ids[2],position:1}]);expect(await live(f,f.otherList)).toEqual(otherBefore);expect(await versions(f)).toEqual({collection:v.collection+1,category:v.category+1n});
  const after=await completeSqlSnapshot([f],records);
  expect(after.pins).toEqual(before.pins.filter(row=>row.collection_id!==f.list||row.recommendation_id!==f.ids[1]).map(row=>row.collection_id===f.list&&row.recommendation_id===f.ids[2]?{...row,position:'1'}:row));
  expect(after.memberships).toEqual(before.memberships.filter(row=>row.collection_id!==f.list||row.recommendation_id!==f.ids[1]));
  for(const key of ['recommendations','entities'] as const)expect(after[key]).toEqual(before[key]);
  sqlCollectionDelta(before,after,[f.list],result.xid);sqlCategoryDelta(before,after,f.account,result.xid);unchangedSqlChildren(before,after);
 });
 it('rejects unsafe/gapped ranks atomically and rolls back the revision marker',async()=>{
  const f=await seed();await replace(f);const before=await versions(f);
  await expect(runtime.query('UPDATE collection_place_pins SET position=9007199254740991 WHERE collection_id=$1',[f.list])).rejects.toMatchObject({code:'23514'});
  await expect(runtime.query('UPDATE collection_place_pins SET position=position+1 WHERE collection_id=$1',[f.list])).rejects.toMatchObject({code:'23514'});
  expect(await versions(f)).toEqual(before);expect((await live(f)).map(row=>row.id)).toEqual(f.ids);
 });
 it('quota reservation and processing exhaustion leave live and staging unchanged',async()=>{
  const f=await seed();await begin(f);await begin(f);await expect(begin(f)).rejects.toMatchObject({status:413});
  const before=await versions(f);await expect(command(f,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}},randomUUID(),{...policy,commitWorkUnits:1})).rejects.toMatchObject({status:413});expect(await live(f)).toEqual([]);expect(await versions(f)).toEqual(before);
 });
 it('empty staging commits a zero clear and abort never changes content',async()=>{
  const f=await seed();await replace(f);const draft=await begin(f),clearBefore=await snapshot(f,[draft.draftId]),clearVersions=await versions(f);
  expect(clearBefore.pins).toHaveLength(f.ids.length);const result=await commit(f,draft.draftId,[]);expect(result).toMatchObject({changed:true,pinCount:0});
  expect(await versions(f)).toEqual({collection:clearVersions.collection+1,category:clearVersions.category+1n});await resultVersions(f,result);expect(await live(f)).toEqual([]);await terminal(f,draft.draftId,'committed');
  const next=await begin(f),before=await versions(f);await append(f,next.draftId,0,f.ids);
  expect(await command(f,{operation:'abortPlacePinsDraft',collectionId:f.list,draftId:next.draftId,body:{}})).toMatchObject({changed:true});expect(await versions(f)).toEqual(before);expect(await live(f)).toEqual([]);await terminal(f,next.draftId,'aborted');
 });
 it('requires active account authority before a previously completed replay',async()=>{
  const f=await seed(),key=randomUUID(),request={operation:'replacePlacePins' as const,collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}};
  const userId=`places-replay-owner-${randomUUID()}`,sessionId=randomUUID();
  await admin.query("INSERT INTO auth_user(id,name,email) VALUES($1,'Replay owner',$2)",[userId,`${userId}@example.invalid`]);
  await admin.query("INSERT INTO account_memberships(account_id,user_id,role) VALUES($1,$2,'owner')",[f.account,userId]);
  await admin.query('INSERT INTO user_security_state(user_id) VALUES($1)',[userId]);
  const session=(await admin.query("INSERT INTO auth_session(id,user_id,token,expires_at,updated_at) VALUES($1,$2,$3,now()+interval '1 hour',now()) RETURNING session_version",[sessionId,userId,randomUUID()])).rows[0];
  const actor:Actor={userId,accountId:f.account,role:'owner',credential:{kind:'web-session',sessionId,sessionVersion:Number(session.session_version)}};
  expect(await command(f,request,key)).toMatchObject({changed:true,pinCount:f.ids.length});
  const expectedRevision=Number((await admin.query('SELECT revision FROM creator_accounts WHERE id=$1',[f.account])).rows[0].revision);
  const deactivated=await new AccountLifecycleService(runtime).requestAccountDeactivation(actor,{expectedRevision},{requestId:randomUUID(),idempotencyKey:randomUUID()});
  expect(deactivated).toMatchObject({accountId:f.account,status:'suspended',revision:expectedRevision+1});
  expect(deactivated.operationId).toEqual(expect.any(String));
  const state=(await admin.query(`SELECT a.status,a.suspended_at,o.id operation_id,o.kind,o.state,o.requested_by_user_id
   FROM creator_accounts a JOIN account_lifecycle_operations o ON o.account_id=a.id WHERE a.id=$1 AND o.id=$2`,[f.account,deactivated.operationId])).rows[0];
  expect(state).toMatchObject({status:'suspended',operation_id:deactivated.operationId,kind:'deactivate',state:'succeeded',requested_by_user_id:userId});
  expect(state.suspended_at).toEqual(expect.any(Date));
  await expect(command(f,request,key)).rejects.toMatchObject({status:404});
 });
 it('denies direct private marker writes and direct private helper execution',async()=>{
  const f=await seed();await expect(runtime.query('UPDATE account_category_content_state SET places_last_mutation_xid=pg_current_xact_id() WHERE account_id=$1',[f.account])).rejects.toMatchObject({code:'42501'});
  const functions=(await admin.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%place%pin%' AND p.proname<>'purge_explorers_account_content'")).rows;
  for(const fn of functions)expect((await runtime.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') granted",[fn.signature])).rows[0].granted).toBe(false);
 });
 it('rolls back promotion and staging terminalization when receipt persistence fails',async()=>{
  const f=await seed();await replace(f);const ids=[...f.ids].reverse(),draft=await begin(f);await append(f,draft.draftId,0,ids);
  const request=commitRequest(f,draft.draftId,ids),key=randomUUID(),context={requestId:randomUUID(),idempotencyKey:key};
  const adapter=faultRepository({after:false,matches:(sql,args)=>sql.startsWith('INSERT INTO application_command_receipts')&&args[1]===request.operation});
  await injected(f,request,key,adapter,context);
  expect(adapter.observed.some(sql=>sql.startsWith('UPDATE place_pin_drafts SET state=$2'))).toBe(true);
  const result=await repo.execute(f.account,request,context,Buffer.byteLength(JSON.stringify(request)),policy);expect(result).toMatchObject({changed:true});await resultVersions(f,result);
  expect(await live(f)).toEqual(ids.map((id,position)=>({id,position})));expect(await receipt(f,request,key)).toHaveLength(1);await terminal(f,draft.draftId,'committed');
 });
 it('serializes concurrent begin quotas and chunk acknowledgements under the actual account lock',async()=>{
  const f=await seed();const outcomes=await Promise.allSettled([begin(f),begin(f),begin(f)]);
  expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(2);
  expect(outcomes.filter(result=>result.status==='rejected').map(result=>(result as PromiseRejectedResult).reason.status)).toEqual([413]);
  const draft=(outcomes.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<any>).value;
  const [first,second]=await Promise.all([append(f,draft.draftId,0,f.ids),append(f,draft.draftId,0,f.ids)]);expect(second).toEqual(first);
  const conflict=await Promise.allSettled([append(f,draft.draftId,1,[f.ids[0]]),append(f,draft.draftId,1,[f.ids[1]])]);
  expect(conflict.filter(result=>result.status==='fulfilled')).toHaveLength(1);expect((conflict.find(result=>result.status==='rejected') as PromiseRejectedResult).reason.status).toBe(409);
 });
 it('uses two real connections to retain a stale draft when membership deletion wins the account barrier',async()=>{
  const f=await seed(),draft=await begin(f);await append(f,draft.draftId,0,f.ids);const holder=await runtime.connect();let pending:Promise<any>|undefined;
  try{await holder.query('BEGIN');await holder.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.account]);
   const pid=(await holder.query('SELECT pg_backend_pid() pid')).rows[0].pid;
   pending=commit(f,draft.draftId,f.ids).then(value=>({value}),error=>({error}));await waitBlockedBy(pid);
   await lockContentCategories(holder,f.account,['places']);await holder.query('SELECT id FROM collections WHERE id=$1 FOR UPDATE',[f.list]);
   await holder.query('SELECT id FROM recommendations WHERE id=$1 FOR UPDATE',[f.ids[0]]);
   await holder.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[0]]);await holder.query('COMMIT');
   expect((await pending).error).toMatchObject({status:409});expect(await live(f)).toEqual([]);
   expect((await admin.query('SELECT state,item_count FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'open',item_count:String(f.ids.length)});
  }finally{await holder.query('ROLLBACK');holder.release();await pending;}
 });
 it('collection archive aborts private staging and outer rollback restores pins/drafts/revisions',async()=>{
  const f=await seed();await replace(f);const draft=await begin(f);await append(f,draft.draftId,0,f.ids);const before=await versions(f),db=await runtime.connect();
  try{await db.query('BEGIN');await db.query('UPDATE collections SET archived_at=clock_timestamp() WHERE id=$1',[f.list]);
   expect((await db.query('SELECT state,accepted_bytes FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'aborted',accepted_bytes:'0'});
   await db.query('ROLLBACK');
  }finally{await db.query('ROLLBACK');db.release();}
  expect(await versions(f)).toEqual(before);expect((await live(f)).map(row=>row.id)).toEqual(f.ids);
  expect((await admin.query('SELECT state FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0].state).toBe('open');
  await new ExplorersRecommendationRepository(runtime).archiveCollection(f.account,f.list,before.collection,randomUUID());
  expect(await versions(f)).toEqual({collection:before.collection+1,category:before.category+1n});expect(await live(f)).toEqual([]);
 });
 it('classifies foreign collections/drafts as 404 and active nonmembership as 422',async()=>{
  const f=await seed(),foreign=await seed();
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('place','Synthetic nonmember','manual') RETURNING id")).rows[0].id;
  const nonmember=(await admin.query("INSERT INTO recommendations(account_id,category,entity_id) VALUES($1,'places',$2) RETURNING id",[f.account,entity])).rows[0].id;
  await new ExplorersRecommendationRepository(runtime).archiveRecommendation(f.account,f.ids[2],1,randomUUID());
  const books=(await admin.query("INSERT INTO collections(account_id,category,title,slug,display_order) VALUES($1,'books','Fixture Books',$2,0) RETURNING id",[f.account,randomUUID()])).rows[0].id;
  await replace(f,[f.ids[0]]);const draft=await begin(f),before=await snapshot(f,[draft.draftId]);
  const reject=async(request:PlacePinsRequest,status:number)=>{const key=randomUUID();expect(await receipt(f,request,key)).toEqual([]);await expect(command(f,request,key)).rejects.toMatchObject({status});expect(await snapshot(f,[draft.draftId])).toEqual(before);expect(await receipt(f,request,key)).toEqual([]);};
  await reject({operation:'placePinsAvailability',collectionId:foreign.list},404);
  await reject({operation:'abortPlacePinsDraft',collectionId:f.otherList,draftId:draft.draftId,body:{}},404);
  const foreignDraft=await begin(foreign);await reject({operation:'abortPlacePinsDraft',collectionId:f.list,draftId:foreignDraft.draftId,body:{}},404);
  await reject({operation:'placePinsAvailability',collectionId:books},422);
  for(const id of [foreign.ids[0],nonmember,f.ids[2]])await reject({operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:[id]}},422);
 });
 it('expires staging using the original policy, retains private terminal identities, then retires receipts without key reuse',async()=>{
  const f=await seed();const expiryPolicy={...policy,draftExpiryMs:100,stagingRetentionMs:200,receiptRetentionMs:400,cleanupBatchSize:100,cleanupWorkUnits:1000};
  const Q={...policy,policyId:'disposable-expiry-caller',policyVersion:2,cleanupBatchSize:100,cleanupWorkUnits:1000};
  const key=randomUUID(),request={operation:'beginPlacePinsDraft' as const,collectionId:f.list,body:await fences(f)};
  const draft=await command(f,request,key,expiryPolicy),before=await versions(f);
  const original=await snapshot(f,[draft.draftId]),originalReceipts=await receipt(f,request,key);
  expect(original.drafts[0]).toMatchObject({policy_snapshot:expiryPolicy});expect(original.drafts[0].expires_at.toISOString()).toBe(draft.expiresAt);
  await waitDatabaseCondition('SELECT expires_at<=clock_timestamp() ready FROM place_pin_drafts WHERE id=$1',[draft.draftId]);
  await expect(command(f,appendRequest(f,draft.draftId,f.ids),randomUUID(),Q)).rejects.toMatchObject({status:409});
  await repo.cleanupExpired(Q);expect(await versions(f)).toEqual(before);
  expect((await admin.query('SELECT state,accepted_bytes FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'expired',accepted_bytes:'0'});
  expect(await command(f,request,key,Q)).toEqual(draft);expect(await receipt(f,request,key)).toEqual(originalReceipts);
  await waitDatabaseCondition('SELECT terminal_at+interval \'200 milliseconds\'<=clock_timestamp() ready FROM place_pin_drafts WHERE id=$1',[draft.draftId]);
  await repo.cleanupExpired(Q);expect((await admin.query('SELECT 1 FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rowCount).toBe(0);
  const deleted=await snapshot(f,[draft.draftId]);
  await waitDatabaseCondition('SELECT replay_until<=clock_timestamp() ready FROM application_command_receipts WHERE account_id=$1 AND operation=\'beginPlacePinsDraft\'',[f.account]);
  await expect(command(f,request,key,Q)).rejects.toMatchObject({status:409});expect(await receipt(f,request,key)).toEqual(originalReceipts);expect(await snapshot(f,[draft.draftId])).toEqual(deleted);
  await repo.cleanupExpired(Q);
  expect((await admin.query('SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation=\'beginPlacePinsDraft\'',[f.account])).rows[0]).toEqual({status:'retired',response:null});
  const retired=await receipt(f,request,key);await expect(command(f,request,key,Q)).rejects.toMatchObject({status:409});
  await expect(command(f,{...request,body:{...request.body,expectedCollectionRevision:request.body.expectedCollectionRevision+1}},key,Q)).rejects.toMatchObject({status:409});
  expect(await receipt(f,request,key)).toEqual(retired);expect(await snapshot(f,[draft.draftId])).toEqual(deleted);
 });
 it('keeps immediate foreign-key failure cleanup and category invalidation atomic',async()=>{
  const f=await seed(),foreign=await seed(),records=[...await sqlSetup(f),...await sqlSetup(foreign)],before=await versions(f);
  await rejectRawSql([f,foreign],records,async db=>{await db.query('UPDATE recommendations SET account_id=$2 WHERE id=$1',[f.ids[1],foreign.account]);},['23503']);
  expect((await live(f)).map(row=>row.id)).toEqual(f.ids);expect(await versions(f)).toEqual(before);
 });
 it('guards lifecycle purge and retains tombstone category counters on retry',async()=>{
  // Removing any content cascade, authority guard, receipt retirement, or xid
  // dedup changes this full graph. Assets belong to later lifecycle maintenance.
  const {target:f,foreign,records}=await fullOwnedSqlFixture(),fixtures=[f,foreign],operation=await lifecycleSqlOperation(f.account);
  const active=await completeSqlSnapshot(fixtures,records),denied=await rawSqlTransaction(async db=>{await db.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation]);});
  expect(denied.code).toBe('42501');expect(denied.committed).toBe(false);expect(await completeSqlSnapshot(fixtures,records)).toEqual(active);
  await admin.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=$2 WHERE id=$1",[f.account,fixtureTime]);
  const before=await completeSqlSnapshot(fixtures,records);
  expect(before.collections.filter(r=>r.account_id===f.account)).toHaveLength(9);expect(before.recommendations.filter(r=>r.account_id===f.account)).toHaveLength(8);
  for(const [table] of ownedSqlRelations)expect(before.inventory[table].some(r=>r.account_id===f.account),table).toBe(true);
  const purge=async(db:pg.PoolClient)=>{expect((await db.query('SELECT purge_explorers_account_content($1,$2) removed',[f.account,operation])).rows[0].removed).toBe(17);};
  const rolled=await rawSqlTransaction(purge,{rollback:true});expect(rolled.error).toBeUndefined();expect(rolled.drained).toBe(true);expect(rolled.committed).toBe(false);expect(await completeSqlSnapshot(fixtures,records)).toEqual(before);
  const committed=await rawSqlTransaction(purge);expect(committed.error).toBeUndefined();expect(committed.drained).toBe(true);expect(committed.committed).toBe(true);
  const after=await completeSqlSnapshot(fixtures,records);
  for(const key of ['collections','recommendations','memberships','pins','drafts'] as const)expect(after[key]).toEqual(before[key].filter(r=>r.account_id!==f.account));
  expect(after.markers).toEqual(before.markers.filter(r=>!f.allLists!.includes(r.collection_id)));
  const deletedDraftIds=before.drafts.filter(r=>r.account_id===f.account).map(r=>r.id);
  for(const key of ['chunks','items'] as const)expect(after[key]).toEqual(before[key].filter(r=>!deletedDraftIds.includes(r.draft_id)));
  for(const key of ['entities','receipts','exactReceipts','pinQueue','chunkQueue'] as const)expect(after[key]).toEqual(before[key]);
  const retained=new Set(['media_assets','analytics_event_receipts','account_lifecycle_operations','deletion_feedback','creator_accounts',...sharedSqlRelations,'book_entity_details','app_entity_details','product_entity_details','person_entity_details','place_entity_details','movie_entity_details','entity_identifiers','places_pin_validation_dirty','places_chunk_validation_dirty']);
  for(const [table,rows] of Object.entries(before.inventory)){
   if(table==='analytics_event_receipts')continue;
   expect(after.inventory[table],table).toEqual(retained.has(table)?rows:rows.filter(r=>r.account_id!==f.account));
  }
  expect(after.inventory.analytics_event_receipts).toHaveLength(before.inventory.analytics_event_receipts.length);
  for(const receipt of before.inventory.analytics_event_receipts){const current=after.inventory.analytics_event_receipts.find(r=>r.account_id===receipt.account_id&&r.client_event_id===receipt.client_event_id);
   if(receipt.account_id===f.account&&receipt.event_id!==null){expect(current.retired_at).toBeInstanceOf(Date);expect(current).toEqual({...receipt,event_id:null,retired_at:current.retired_at});}else expect(current).toEqual(receipt);
  }
  expect(after.categories).toHaveLength(before.categories.length);expect(after.categories.filter(r=>r.account_id===f.account)).toHaveLength(8);
  for(const row of before.categories){const current=after.categories.find(r=>r.account_id===row.account_id&&r.category===row.category);expect(current).toBeDefined();
   if(row.account_id!==f.account)expect(current).toEqual(row);
   else if(row.category==='places')expect(current).toEqual({...row,revision:String(BigInt(row.revision)+1n),places_last_mutation_xid:committed.xid});
   else{expect(BigInt(current.revision)).toBeGreaterThanOrEqual(BigInt(row.revision));expect(current).toEqual({...row,revision:current.revision});}
  }
  const retry=await rawSqlTransaction(async db=>{expect((await db.query('SELECT purge_explorers_account_content($1,$2) removed',[f.account,operation])).rows[0].removed).toBe(0);});
  expect(retry.error).toBeUndefined();expect(retry.drained).toBe(true);expect(retry.committed).toBe(true);expect(await completeSqlSnapshot(fixtures,records)).toEqual(after);
 });
 it('rejects oversized old-live zero clears by cumulative bytes/work before mutation',async()=>{
  const f=await seed(20);await replace(f);const before=await versions(f);
  await expect(command(f,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:[]}},randomUUID(),{...policy,commitWorkUnits:10})).rejects.toMatchObject({status:413});
  expect((await live(f)).map(row=>row.id)).toEqual(f.ids);expect(await versions(f)).toEqual(before);
  const smallBytes={...policy,transportChunkBytes:512,transportChunkIds:1,replacementBytes:512,replacementIds:1,ownerStagingBytes:512,commitProcessingBytes:512};
  await expect(command(f,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:[]}},randomUUID(),smallBytes)).rejects.toMatchObject({status:413});
  expect((await live(f)).map(row=>row.id)).toEqual(f.ids);expect(await versions(f)).toEqual(before);
 });
 it('cancels deferred validation at COMMIT within the original deadline and rolls back live/receipt changes',async()=>{
  const f=await seed(1),before=await versions(f),key=randomUUID();
  // Disposable test-only DDL. Root must include these exact fixture objects in
  // the approved resource guard; they are always removed in finally.
  await admin.query("CREATE FUNCTION public.fixture_places_commit_delay() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_catalog.pg_sleep(0.5); RETURN NULL; END $$");
  try{
   await admin.query('CREATE CONSTRAINT TRIGGER fixture_places_commit_delay AFTER INSERT ON public.collection_place_pins DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fixture_places_commit_delay()');
   await expect(command(f,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}},key,{...policy,commitProcessingMs:250})).rejects.toMatchObject({status:413});
   expect(await live(f)).toEqual([]);expect(await versions(f)).toEqual(before);
   expect((await admin.query("SELECT 1 FROM application_command_receipts WHERE account_id=$1 AND operation='replacePlacePins'",[f.account])).rowCount).toBe(0);
  }finally{await admin.query('DROP TRIGGER IF EXISTS fixture_places_commit_delay ON public.collection_place_pins');await admin.query('DROP FUNCTION public.fixture_places_commit_delay()');}
  expect(await replace(f,f.ids,key)).toMatchObject({changed:true});
 });
 it('refreshes the COMMIT processing timeout on the server after the final message spends most remaining time in transit',async()=>{
  const f=await seed(1),before=await versions(f),key=randomUUID(),activePolicy={...policy,commitProcessingMs:250};let deferredMessage=false;
  // Same reviewed disposable-only fixture names as the earlier cancellation
  // case, now with a 40ms deferred wait and only 15ms left at server admission.
  await admin.query("CREATE FUNCTION public.fixture_places_commit_delay() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN PERFORM pg_catalog.pg_sleep(0.04); RETURN NULL; END $$");
  try{
   await admin.query('CREATE CONSTRAINT TRIGGER fixture_places_commit_delay AFTER INSERT ON public.collection_place_pins DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.fixture_places_commit_delay()');
   const delayedPool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args?:unknown[])=>{
    if(sql.startsWith('DO $places_deadline$')){
     deferredMessage=true;const timestamp=sql.match(/'([^']+)'::timestamptz-clock_timestamp\(\)/)?.[1];expect(timestamp).toBeDefined();
     const serverNow=(await admin.query('SELECT clock_timestamp() now')).rows[0].now as Date;
     const delay=Math.max(0,Date.parse(timestamp!)-serverNow.getTime()-15);expect(delay).toBeLessThanOrEqual(activePolicy.commitProcessingMs);
     await new Promise(resolve=>setTimeout(resolve,delay));
    }
    return db.query(sql,args);
   },release:()=>db.release()};}} as unknown as pg.Pool;
   const started=performance.now();
   await expect(new ExplorersPlacePinsRepository(delayedPool).execute(f.account,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}},{requestId:randomUUID(),idempotencyKey:key},200,activePolicy)).rejects.toMatchObject({status:413});
   // Allows bounded transport/rollback scheduling overhead; correctness is the
   // pre-persistence cancellation and unchanged actual rows, not realtime fsync.
   expect(performance.now()-started).toBeLessThan(activePolicy.commitProcessingMs+250);
   expect(deferredMessage).toBe(true);expect(await live(f)).toEqual([]);expect(await versions(f)).toEqual(before);
   expect((await admin.query("SELECT 1 FROM application_command_receipts WHERE account_id=$1 AND operation='replacePlacePins'",[f.account])).rowCount).toBe(0);
  }finally{await admin.query('DROP TRIGGER IF EXISTS fixture_places_commit_delay ON public.collection_place_pins');await admin.query('DROP FUNCTION public.fixture_places_commit_delay()');}
  expect(await replace(f,f.ids,key)).toMatchObject({changed:true});
 });
 it('rejects validation completed after absolute expiry even when a stale statement timeout permits it',async()=>{
  const f=await seed(1),before=await versions(f),key=randomUUID();let forcedValidation=false,completionRejected=false;
  // Test transport seam deliberately models a stale timeout and stalled server
  // transition. Real SQL validation and the production completion fence execute.
  const delayedPool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args?:unknown[])=>{
   if(sql.startsWith('DO $places_deadline$')){
    expect(sql).toContain('SET CONSTRAINTS ALL IMMEDIATE;');expect(sql).toContain('DO $places_completion$');
    sql=sql.replaceAll('(remaining-1)::text','1000::text').replace('SET CONSTRAINTS ALL IMMEDIATE;','SELECT pg_catalog.pg_sleep(0.3); SET CONSTRAINTS ALL IMMEDIATE;');
    forcedValidation=true;
   }
   try{return await db.query(sql,args);}catch(error){completionRejected=(error as {message?:string}).message==='Places processing completion deadline exhausted';throw error;}
  },release:()=>db.release()};}} as unknown as pg.Pool;
  await expect(new ExplorersPlacePinsRepository(delayedPool).execute(f.account,{operation:'replacePlacePins',collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}},{requestId:randomUUID(),idempotencyKey:key},200,{...policy,commitProcessingMs:250})).rejects.toMatchObject({status:413,message:'Places pin processing or numeric budget exhausted'});
  expect(forcedValidation).toBe(true);expect(completionRejected).toBe(true);expect(await live(f)).toEqual([]);expect(await versions(f)).toEqual(before);
  expect((await admin.query("SELECT 1 FROM application_command_receipts WHERE account_id=$1 AND operation='replacePlacePins'",[f.account])).rowCount).toBe(0);
  expect(await replace(f,f.ids,key)).toMatchObject({changed:true});
 });
 it('continues cleanup within owners, bypasses retained terminal drafts, and does not skip later owners',async()=>{
  const fixtures=await Promise.all([seed(1),seed(1)]);fixtures.sort((a,b)=>a.account.localeCompare(b.account));
  const short={...policy,policyId:'disposable-cleanup-short',ownerDraftQuota:10,draftExpiryMs:100,stagingRetentionMs:200,receiptRetentionMs:20000,cleanupBatchSize:2,cleanupWorkUnits:2};
  const long={...short,policyId:'disposable-cleanup-long',stagingRetentionMs:10000},Q={...policy,policyId:'disposable-cleanup-caller',cleanupBatchSize:2,cleanupWorkUnits:2};
  const targets:{f:Fixture;draftId:string;kind:'long'|'short'|'open';bytes:number;saved:any}[]=[],receipts:{f:Fixture;request:PlacePinsRequest;key:string;rows:any[]}[]=[];
  const save=async(f:Fixture,request:PlacePinsRequest,p=short)=>{const key=randomUUID(),result=await command(f,request,key,p);receipts.push({f,request,key,rows:await receipt(f,request,key)});return result;};
  for(const f of fixtures){
   await replace(f);await replace({...f,list:f.otherList});
   for(const [index,kind] of (['long','short','open','open','open'] as const).entries()){
    const target={...f,list:index%2?f.otherList:f.list},p=kind==='long'?long:short;
    const opened=await save(target,{operation:'beginPlacePinsDraft',collectionId:target.list,body:await fences(target)},p),request=appendRequest(target,opened.draftId,target.ids);
    const bytes=Buffer.byteLength(JSON.stringify(request))+64;await save(target,request,p);
    if(kind!=='open')await save(target,{operation:'abortPlacePinsDraft',collectionId:target.list,draftId:opened.draftId,body:{}},p);
    const saved=await snapshot(f,[opened.draftId]);expect(saved.drafts[0]).toMatchObject({policy_snapshot:p,accepted_bytes:kind==='open'?String(bytes):'0'});
    targets.push({f:target,draftId:opened.draftId,kind,bytes,saved});
   }
  }
  const accounts=fixtures.map(f=>f.account),allIds=targets.map(t=>t.draftId),before=await Promise.all(fixtures.map(f=>snapshot(f))),adapter=observingRepository();
  await waitDatabaseCondition(`SELECT bool_and(CASE WHEN policy_id=$2 AND state='aborted' THEN terminal_at+interval '10000 milliseconds'>clock_timestamp() WHEN state='open' THEN expires_at<=clock_timestamp() ELSE terminal_at+interval '200 milliseconds'<=clock_timestamp() END) ready FROM place_pin_drafts WHERE id=ANY($1::uuid[])`,[allIds,long.policyId]);
  const zero='00000000-0000-0000-0000-000000000000',visited=new Set<string>();let after=zero,resume:Parameters<ExplorersPlacePinsRepository['cleanupExpired']>[2];
  const expirations=new Map<string,{locked:number;updated:number;childrenDeleted:number;completed:number}>(),retirements=new Map<string,{locked:number;deleted:number;completed:number}>();
  const ownerBytes=async()=> (await admin.query('SELECT account_id,coalesce(sum(accepted_bytes),0)::text bytes FROM place_pin_drafts WHERE account_id=ANY($1::uuid[]) GROUP BY account_id ORDER BY account_id',[accounts])).rows;
  const unchanged=async()=>{for(const [i,f] of fixtures.entries()){const current=await snapshot(f);expect(current.pins).toEqual(before[i].pins);expect(current.collections).toEqual(before[i].collections);expect(current.categories).toEqual(before[i].categories);}for(const record of receipts){expect(record.rows[0].replay_until.getTime()).toBeGreaterThan(await databaseClock());expect(await receipt(record.f,record.request,record.key)).toEqual(record.rows);}};
  const drain=async(phase:'terminalize'|'retire')=>{
   for(let calls=0;calls<200;calls++){
    const offset=adapter.observations.length,charges=await ownerBytes(),result=await adapter.repository.cleanupExpired(Q,after,resume),events=adapter.observations.slice(offset);
    const owners=events.find(o=>o.sql.startsWith('SELECT account_id FROM ('));expect(owners).toBeDefined();expect(owners!.args).toEqual([after,2,resume?.accountId??null]);
    const ownerIds=owners!.rows.map(r=>r.account_id);expect(ownerIds).toEqual([...ownerIds].sort());
    const pages=events.filter(o=>o.sql.startsWith('SELECT id,collection_id FROM place_pin_drafts'));
    for(const page of pages){expect(page.args[3]).toBe(1);const cursor=`${page.args[1]}:${page.args[2]}`,tuples=page.rows.map(r=>`${r.collection_id}:${r.id}`);expect(tuples).toEqual([...tuples].sort());for(const tuple of tuples)expect(tuple>cursor).toBe(true);
     const expected=resume?.accountId===page.args[0]?resume:undefined;expect(page.args.slice(1,3)).toEqual([expected?.afterCollectionId??zero,expected?.afterDraftId??zero]);
     for(const row of page.rows){visited.add(`${page.args[0]}:${row.collection_id}:${row.id}`);expect(events.some(o=>o.sql.startsWith('SELECT *,expires_at<=')&&o.args[0]===row.id)).toBe(true);}
    }
    const later=events.find(o=>o.sql.startsWith('SELECT EXISTS(SELECT 1 FROM place_pin_drafts')&&o.sql.includes('AND (collection_id,id)>'));
    if(result.continuation){expect(later).toBeDefined();if(later!.rows[0].pending){const last=pages.at(-1)?.rows.at(-1);expect(result.continuation).toEqual({accountId:later!.args[0],afterCollectionId:last.collection_id,afterDraftId:last.id});}else expect(result.continuation).toEqual({accountId:later!.args[0],afterCollectionId:zero,afterDraftId:zero});}
    if(result.nextAccountId){const pending=events.find(o=>o.sql.startsWith('SELECT EXISTS(SELECT 1 FROM place_pin_drafts')&&!o.sql.includes('AND (collection_id,id)>')&&o.args[0]===result.nextAccountId);expect(pending?.rows[0].pending).toBe(false);}
    // Only successful real statements from a completed cleanup call prove a
    // target transition. Later original-policy retirement may occur in either phase.
    for(const [index,event] of events.entries()){
     if(!event.sql.startsWith('SELECT *,expires_at<=')||event.rowCount!==1)continue;
     const target=targets.find(t=>t.draftId===event.args[0]);if(!target)continue;const row=event.rows[0];
     expect(row).toMatchObject({id:target.draftId,account_id:target.f.account,collection_id:target.f.list,policy_snapshot:target.kind==='long'?long:short});
     for(const field of ['policy_id','policy_version','policy_snapshot','expected_collection_revision','expected_category_content_revision','created_at','expires_at'])expect(row[field]).toEqual(target.saved.drafts[0][field]);
     if(row.state==='open'){
      expect(target.kind).toBe('open');expect(expirations.has(target.draftId)).toBe(false);
      expect(row).toMatchObject({expired:true,accepted_bytes:String(target.bytes),item_count:'1',chunk_count:'1'});
      const updated=events.findIndex((o,i)=>i>index&&o.sql.startsWith('UPDATE place_pin_drafts SET state=')&&o.args[0]===target.draftId);
      expect(updated).toBeGreaterThan(index);expect(events[updated].args).toEqual([target.draftId,'expired','null']);expect(events[updated].rowCount).toBe(1);
      const childrenDeleted=events.findIndex((o,i)=>i>updated&&o.sql.startsWith('DELETE FROM place_pin_draft_chunks WHERE draft_id=')&&o.args[0]===target.draftId);
      expect(childrenDeleted).toBeGreaterThan(updated);expect(events[childrenDeleted].args).toEqual([target.draftId]);expect(events[childrenDeleted].rowCount).toBe(1);
      const completed=events.findIndex((o,i)=>i>childrenDeleted&&o.sql.startsWith('DO $places_deadline$')&&/COMMIT;\s*$/.test(o.sql));expect(completed).toBeGreaterThan(childrenDeleted);
      expirations.set(target.draftId,{locked:offset+index,updated:offset+updated,childrenDeleted:offset+childrenDeleted,completed:offset+completed});
     }else{
      expect(target.kind).not.toBe('long');expect(row).toMatchObject({state:target.kind==='open'?'expired':'aborted',accepted_bytes:'0',item_count:'0',chunk_count:'0',retireable:true});
      if(target.kind==='open'){const expiry=expirations.get(target.draftId);expect(expiry).toBeDefined();expect(offset+index).toBeGreaterThan(expiry!.completed);}
      const deleted=events.findIndex((o,i)=>i>index&&o.sql.startsWith('DELETE FROM place_pin_drafts WHERE id=')&&o.args[0]===target.draftId);
      expect(deleted).toBeGreaterThan(index);expect(events[deleted].args).toEqual([target.draftId]);expect(events[deleted].rowCount).toBe(1);
      const completed=events.findIndex((o,i)=>i>deleted&&o.sql.startsWith('DO $places_deadline$')&&/COMMIT;\s*$/.test(o.sql));expect(completed).toBeGreaterThan(deleted);
      expect(retirements.has(target.draftId)).toBe(false);retirements.set(target.draftId,{locked:offset+index,deleted:offset+deleted,completed:offset+completed});
     }
    }
    const affected=events.filter(o=>o.sql.startsWith('UPDATE place_pin_drafts SET state=')).map(o=>o.args[0]),afterCharges=await ownerBytes();
    for(const charge of charges){const decrement=targets.filter(t=>t.f.account===charge.account_id&&affected.includes(t.draftId)).reduce((sum,t)=>sum+t.bytes,0);expect(Number(afterCharges.find(r=>r.account_id===charge.account_id)?.bytes??0)).toBe(Number(charge.bytes)-decrement);}
    await unchanged();if(result.nextAccountId)after=result.nextAccountId;resume=result.continuation??undefined;if(!result.nextAccountId&&!resume)after=zero;
    const current=await snapshot(fixtures[0],allIds),eligible=current.drafts.filter(r=>targets.find(t=>t.draftId===r.id)?.kind!=='long'&&(phase==='retire'||r.state==='open'||r.state==='aborted'));
    if(!eligible.length)return;
   }throw new Error(`Bounded cleanup ${phase} failed to drain target tuples`);
  };
  await drain('terminalize');
  for(const target of targets){const current=await snapshot(target.f,[target.draftId]);expect(current.chunks).toEqual([]);expect(current.items).toEqual([]);
   if(target.kind==='short'){expect(current.drafts).toEqual([]);expect(retirements.has(target.draftId)).toBe(true);}else if(target.kind==='long')expect(current).toEqual(target.saved);else{
    expect(expirations.has(target.draftId)).toBe(true);
    if(current.drafts.length){expect(current.drafts).toHaveLength(1);expect(current.drafts[0]).toMatchObject({state:'expired',accepted_bytes:'0',item_count:'0',chunk_count:'0',policy_snapshot:short});expect(retirements.has(target.draftId)).toBe(false);}
    else expect(retirements.has(target.draftId)).toBe(true);
   }}
  await waitDatabaseCondition(`SELECT coalesce(bool_and(terminal_at+interval '200 milliseconds'<=clock_timestamp()),true) ready FROM place_pin_drafts WHERE id=ANY($1::uuid[])`,[targets.filter(t=>t.kind==='open').map(t=>t.draftId)]);
  after=zero;resume=undefined;await drain('retire');await unchanged();
  for(const target of targets){expect(visited.has(`${target.f.account}:${target.f.list}:${target.draftId}`)).toBe(target.kind!=='long');const current=await snapshot(target.f,[target.draftId]);if(target.kind==='long')expect(current).toEqual(target.saved);else{expect(current.drafts).toEqual([]);expect(retirements.has(target.draftId)).toBe(true);if(target.kind==='open')expect(expirations.has(target.draftId)).toBe(true);}}
  for(const f of fixtures)for(const list of [f.list,f.otherList])expect([...visited].some(tuple=>tuple.startsWith(`${f.account}:${list}:`))).toBe(true);
 });
 it('preserves historical archived Books parent increments during recommendation archive',async()=>{
  const recommendations=new ExplorersRecommendationRepository(runtime);
  const account=(await admin.query('INSERT INTO creator_accounts DEFAULT VALUES RETURNING id')).rows[0].id;
  const entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Fixture book','manual') RETURNING id")).rows[0].id;
  const list=await recommendations.createCollection(account,{category:'books',title:'Fixture archived parent',slug:randomUUID()},randomUUID());
  const item=await recommendations.createRecommendation(account,{category:'books',entityId:entity,collectionId:list.id,expectedCollectionRevision:list.revision},randomUUID());
  const current=(await admin.query('SELECT revision FROM collections WHERE id=$1',[list.id])).rows[0].revision;
  await recommendations.archiveCollection(account,list.id,Number(current),randomUUID());
  const before=(await admin.query('SELECT revision FROM collections WHERE id=$1',[list.id])).rows[0].revision;
  await recommendations.archiveRecommendation(account,item.id,item.revision,randomUUID());
  expect(Number((await admin.query('SELECT revision FROM collections WHERE id=$1',[list.id])).rows[0].revision)).toBe(Number(before)+1);
 });
 async function rawPinRejection(variant:'foreign owner insert'|'nonmember insert'|'non-Places category insert'|'archived collection insert'|'archived recommendation insert'|'duplicate recommendation insert'|'duplicate position insert'|'foreign owner update'){
  // Removing the composite FKs/CHECK/unique/final-scope guard must fail these oracles.
  const f=await seed(3),foreign=variant.startsWith('foreign owner')?await seed(1):undefined;
  const duplicate=variant.startsWith('duplicate'),update=variant==='foreign owner update';
  // Complete supported setup precedes archive/membership fixture preparation
  // and the captured baseline. No stale fence is reused by the raw mutation.
  const records=await sqlSetup(variant==='duplicate position insert'?{...f,ids:[f.ids[0]]}:f,duplicate||update);
  if(variant==='nonmember insert')await admin.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[0]]);
  if(variant==='archived collection insert')await admin.query('UPDATE collections SET archived_at=clock_timestamp() WHERE id=$1',[f.list]);
  if(variant==='archived recommendation insert')await admin.query('UPDATE recommendations SET archived_at=clock_timestamp() WHERE id=$1',[f.ids[0]]);
  if(foreign)records.push(...await sqlSetup(foreign));
  const fixtures=foreign?[f,foreign]:[f],codes=variant==='duplicate position insert'?['23505','23514']:variant==='duplicate recommendation insert'?['23505']:['non-Places category insert','archived collection insert','archived recommendation insert'].includes(variant)?['23514']:['23503'];
  await rejectRawSql(fixtures,records,async db=>{
   if(update)await db.query('UPDATE collection_place_pins SET account_id=$3 WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[0],foreign!.account]);
   else await db.query('INSERT INTO collection_place_pins(collection_id,recommendation_id,account_id,category,position) VALUES($1,$2,$3,$4,$5)',[f.list,variant==='duplicate position insert'?f.ids[1]:f.ids[0],foreign?.account??f.account,variant==='non-Places category insert'?'books':'places',variant==='duplicate recommendation insert'?f.ids.length:0]);
  },codes);
 }
 it('rejects raw Places pin foreign owner insert with complete rollback',async()=>{await rawPinRejection('foreign owner insert');});
 it('rejects raw Places pin nonmember insert with complete rollback',async()=>{await rawPinRejection('nonmember insert');});
 it('rejects raw Places pin non-Places category insert with complete rollback',async()=>{await rawPinRejection('non-Places category insert');});
 it('rejects raw Places pin archived collection insert with complete rollback',async()=>{await rawPinRejection('archived collection insert');});
 it('rejects raw Places pin archived recommendation insert with complete rollback',async()=>{await rawPinRejection('archived recommendation insert');});
 it('rejects raw Places pin duplicate recommendation insert with complete rollback',async()=>{await rawPinRejection('duplicate recommendation insert');});
 it('rejects raw Places pin duplicate position insert with complete rollback',async()=>{await rawPinRejection('duplicate position insert');});
 it('rejects raw Places pin foreign owner update with complete rollback',async()=>{await rawPinRejection('foreign owner update');});
 it('raw recommendation archive compacts all pinned containing lists once',async()=>{
  // Missing BEFORE cleanup, dense compaction, or xid dedup must be observable.
  const f=await seed(4),records=await sqlSetup(f),before=await completeSqlSnapshot([f],records);
  const result=await rawSqlTransaction(async db=>{await db.query('UPDATE recommendations SET archived_at=clock_timestamp() WHERE id=$1',[f.ids[1]]);});
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f],records),survivors=[f.ids[0],f.ids[2],f.ids[3]];
  for(const list of [f.list,f.otherList])expect(await live(f,list)).toEqual(survivors.map((id,position)=>({id,position})));
  expect(after.pins).toEqual(before.pins.filter(row=>row.recommendation_id!==f.ids[1]).map(row=>({...row,position:String(survivors.indexOf(row.recommendation_id))})));
  sqlCollectionDelta(before,after,[f.list,f.otherList],result.xid);sqlCategoryDelta(before,after,f.account,result.xid);
  expect(after.memberships).toEqual(before.memberships);expect(after.entities).toEqual(before.entities);unchangedSqlChildren(before,after);
  const archived=after.recommendations.find(row=>row.id===f.ids[1]);expect(archived.archived_at).toBeInstanceOf(Date);
  expect(after.recommendations).toEqual(before.recommendations.map(row=>row.id===f.ids[1]?{...row,archived_at:archived.archived_at}:row));
 });
 it('raw compatible recommendation entity update retains pins',async()=>{
  // Compatible place/person assignment must retain both collection revisions.
  const f=await seed(3),records=await sqlSetup(f),entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('person','Raw compatible fixture','manual') RETURNING id")).rows[0].id;
  const old=(await admin.query('SELECT entity_id FROM recommendations WHERE id=$1',[f.ids[0]])).rows[0].entity_id,extras=[old,entity],before=await completeSqlSnapshot([f],records,extras);
  const result=await rawSqlTransaction(async db=>{await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[f.ids[0],entity]);});
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f],records,extras);
  for(const key of ['collections','memberships','pins','entities','markers'] as const)expect(after[key]).toEqual(before[key]);
  expect(after.recommendations).toEqual(before.recommendations.map(row=>row.id===f.ids[0]?{...row,entity_id:entity}:row));
  sqlCategoryDelta(before,after,f.account,result.xid);unchangedSqlChildren(before,after);
 });
 it('raw incompatible recommendation entity update rolls cleanup back',async()=>{
  // Removing 0029's deferred category/kind guard would commit transient cleanup.
  const f=await seed(3),records=await sqlSetup(f),entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('book','Raw incompatible fixture','manual') RETURNING id")).rows[0].id;
  await rejectRawSql([f],records,async db=>{await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[f.ids[1],entity]);},['23514'],[entity]);
 });
 it('raw incompatible entity kind update rolls cleanup back',async()=>{
  const f=await seed(3),records=await sqlSetup(f),entity=(await admin.query('SELECT entity_id FROM recommendations WHERE id=$1',[f.ids[1]])).rows[0].entity_id;
  await rejectRawSql([f],records,async db=>{await db.query("UPDATE entities SET kind='book' WHERE id=$1",[entity]);},['23514']);
 });
 it('raw multirow and multistatement membership deletion compacts once',async()=>{
  const f=await seed(5),records=await sqlSetup(f),before=await completeSqlSnapshot([f],records);
  const result=await rawSqlTransaction(async db=>{
   await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=ANY($2::uuid[])',[f.list,[f.ids[1],f.ids[3]]]);
   await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[0]]);
  });
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f],records),survivors=[f.ids[2],f.ids[4]];
  expect(await live(f)).toEqual([{id:f.ids[2],position:0},{id:f.ids[4],position:1}]);
  expect(after.pins).toEqual(before.pins.filter(row=>row.collection_id!==f.list||survivors.includes(row.recommendation_id)).map(row=>row.collection_id===f.list?{...row,position:String(survivors.indexOf(row.recommendation_id))}:row));
  expect(after.memberships).toEqual(before.memberships.filter(row=>row.collection_id!==f.list||survivors.includes(row.recommendation_id)));
  for(const key of ['recommendations','entities'] as const)expect(after[key]).toEqual(before[key]);
  sqlCollectionDelta(before,after,[f.list],result.xid);sqlCategoryDelta(before,after,f.account,result.xid);unchangedSqlChildren(before,after);
 });
 it('raw membership cleanup outer rollback restores complete state',async()=>{
  const f=await seed(5),records=await sqlSetup(f),before=await completeSqlSnapshot([f],records);
  const result=await rawSqlTransaction(async db=>{
   await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=ANY($2::uuid[])',[f.list,[f.ids[1],f.ids[3]]]);
   await db.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[0]]);
  },{rollback:true});
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(false);
  expect(await completeSqlSnapshot([f],records)).toEqual(before);
 });
 it('privileged collection hard deletion cascades without parent resurrection',async()=>{
  const f=await seed(3),records=await sqlSetup(f),before=await completeSqlSnapshot([f],records);
  const result=await rawSqlTransaction(async db=>{await db.query('DELETE FROM collections WHERE id=$1',[f.list]);},{privileged:true});
  expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f],records),deletedDrafts=before.drafts.filter(row=>row.collection_id===f.list).map(row=>row.id);
  expect(deletedDrafts).toHaveLength(1);expect(before.chunks.filter(row=>deletedDrafts.includes(row.draft_id))).toHaveLength(1);expect(before.items.filter(row=>deletedDrafts.includes(row.draft_id))).toHaveLength(3);
  expect(after.collections).toEqual(before.collections.filter(row=>row.id!==f.list));
  for(const key of ['pins','memberships','markers'] as const)expect(after[key]).toEqual(before[key].filter(row=>row.collection_id!==f.list));
  expect(after.drafts).toEqual(before.drafts.filter(row=>row.collection_id!==f.list));
  for(const key of ['chunks','items'] as const)expect(after[key]).toEqual(before[key].filter(row=>!deletedDrafts.includes(row.draft_id)));
  for(const key of ['recommendations','entities','receipts','exactReceipts','pinQueue','chunkQueue'] as const)expect(after[key]).toEqual(before[key]);
  sqlCategoryDelta(before,after,f.account,result.xid);
 });
 it('rejects raw partial chunk ordinals without committing staging corruption',async()=>{
  // A missing final count/min/max validator would admit indices [0,2] for count 2.
  const f=await seed(3),records=await sqlSetup(f,true,false),draft=records.find(record=>record.request.operation==='beginPlacePinsDraft'&&record.f.list===f.list)!.rows[0].response.draftId;
  await rejectRawSql([f],records,async db=>{
   await db.query("INSERT INTO place_pin_draft_chunks(draft_id,chunk_index,hash,item_count,admitted_bytes,acknowledgement) VALUES($1,0,$2,2,0,'{}'::jsonb)",[draft,Buffer.alloc(32,7)]);
   await db.query('INSERT INTO place_pin_draft_items(draft_id,chunk_index,item_index,recommendation_id) VALUES($1,0,0,$2),($1,0,2,$3)',[draft,f.ids[0],f.ids[1]]);
  },['23514']);
 });
 it('supported Places create leaves individual pins unchanged',async()=>{
  // Accidental pin writes or omission of the default private context must fail.
  const f=await seed(2),foreign=await seed(1),records=[...await sqlSetup(f),...await sqlSetup(foreign)],entity=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('place','New bare fixture','manual') RETURNING id")).rows[0].id;
  f.entityIds=[entity];const before=await completeSqlSnapshot([f,foreign],records),input={category:'places' as const,entityId:entity,collectionId:f.list,expectedCollectionRevision:(await versions(f)).collection},key=randomUUID(),recommendations=new ExplorersRecommendationRepository(runtime);
  const response=await recommendations.createRecommendation(f.account,input,key);f.allIds=[...f.ids,response.id];const after=await completeSqlSnapshot([f,foreign],records);
  await recommendationSqlReceipt(f.account,'createRecommendation',input,key,response,before);
  expect(after.pins).toEqual(before.pins);expect(after.pins.some(r=>r.recommendation_id===response.id)).toBe(false);
  expect(after.recommendations.filter(r=>r.id!==response.id)).toEqual(before.recommendations);expect(after.recommendations.find(r=>r.id===response.id)).toMatchObject({account_id:f.account,category:'places',entity_id:entity});
  expect(after.memberships.filter(r=>r.recommendation_id!==response.id)).toEqual(before.memberships);expect(after.memberships.filter(r=>r.recommendation_id===response.id)).toHaveLength(1);expect(after.memberships.find(r=>r.recommendation_id===response.id)).toMatchObject({collection_id:f.list,account_id:f.account,category:'places',display_order:2});
  const context=after.inventory.place_recommendation_context.find(r=>r.recommendation_id===response.id);expect(context).toMatchObject({account_id:f.account,recommendation_type:'place',contact_visibility:'private',contact_name:null,contact_number:null});
  const expectedInventory={...before.inventory,place_recommendation_context:[context]};expect(after.inventory).toEqual(expectedInventory);
  const xid=after.categories.find(r=>r.account_id===f.account&&r.category==='places').places_last_mutation_xid;sqlCollectionDelta(before,after,[f.list],xid,false);sqlCategoryDelta(before,after,f.account,xid);
  unchangedSqlFields(before,after,['collections','recommendations','memberships','categories','markers','receipts','inventory']);
 });
 it('supported membership reorder leaves individual pin order unchanged',async()=>{
  const f=await seed(3),foreign=await seed(1),records=[...await sqlSetup({...f,ids:[f.ids[1],f.ids[2],f.ids[0]]}),...await sqlSetup(foreign)],before=await completeSqlSnapshot([f,foreign],records),ids=[...f.ids].reverse(),expectedRevision=(await versions(f)).collection,key=randomUUID();
  const response=await new ExplorersRecommendationRepository(runtime).reorderCollection(f.account,f.list,expectedRevision,ids,key),after=await completeSqlSnapshot([f,foreign],records);
  await recommendationSqlReceipt(f.account,'reorderCollection',{id:f.list,expectedRevision,ids},key,response,before);
  expect(after.memberships.filter(r=>r.collection_id===f.list).map(r=>({id:r.recommendation_id,order:r.display_order}))).toEqual(ids.map((id,order)=>({id,order})));
  expect(after.memberships).toEqual(before.memberships.map(r=>r.collection_id===f.list?{...r,display_order:ids.indexOf(r.recommendation_id)}:r).sort((a,b)=>a.collection_id.localeCompare(b.collection_id)||a.display_order-b.display_order||a.recommendation_id.localeCompare(b.recommendation_id)));
  expect(after.memberships.filter(r=>r.collection_id!==f.list)).toEqual(before.memberships.filter(r=>r.collection_id!==f.list));
  const xid=after.categories.find(r=>r.account_id===f.account&&r.category==='places').places_last_mutation_xid;sqlCollectionDelta(before,after,[f.list],xid,false);sqlCategoryDelta(before,after,f.account,xid);
  unchangedSqlFields(before,after,['collections','memberships','categories','markers','receipts']);
 });
 it('supported recommendation update retains omitted Places context and media',async()=>{
  const {target:f,foreign,records}=await fullOwnedSqlFixture();await admin.query("UPDATE recommendations SET publication_state='published' WHERE id=$1",[f.ids[0]]);
  const before=await completeSqlSnapshot([f,foreign],records),old=before.recommendations.find(r=>r.id===f.ids[0]),input={userRating:7},key=randomUUID();
  const response=await new ExplorersRecommendationRepository(runtime).updateRecommendation(f.account,old.id,Number(old.revision),input,key),after=await completeSqlSnapshot([f,foreign],records),updated=after.recommendations.find(r=>r.id===old.id);
  await recommendationSqlReceipt(f.account,'updateRecommendation',{id:old.id,expectedRevision:Number(old.revision),input},key,response,before);
  expect(updated).toEqual({...old,user_rating:7,revision:String(BigInt(old.revision)+1n),updated_at:updated.updated_at});expect(updated.publication_state).toBe('published');
  expect(after.recommendations.filter(r=>r.id!==old.id)).toEqual(before.recommendations.filter(r=>r.id!==old.id));
  const xid=after.categories.find(r=>r.account_id===f.account&&r.category==='places').places_last_mutation_xid;sqlCategoryDelta(before,after,f.account,xid);
  unchangedSqlFields(before,after,['recommendations','categories','receipts']);
 });
 it('raw compatible entity kind update retains individual pins',async()=>{
  const f=await seed(2),foreign=await seed(1),records=[...await sqlSetup(f),...await sqlSetup(foreign)],before=await completeSqlSnapshot([f,foreign],records),entity=before.recommendations.find(r=>r.id===f.ids[0]).entity_id;
  const result=await rawSqlTransaction(async db=>{await db.query("UPDATE entities SET kind='person' WHERE id=$1",[entity]);});expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f,foreign],records);expect(after.entities).toEqual(before.entities.map(r=>r.id===entity?{...r,kind:'person'}:r));unchangedSqlFields(before,after,['entities']);
 });
 it.each(['books','games','apps'] as const)('historical %s create rating update and reorder retain statement deltas',async category=>{
  // Replacing historical statement invalidation with transaction dedup fails +3/+1/+4.
  const {f,foreign,records,list,ids,entity}=await historicalSqlFixture(category),fixtures=[f,foreign],recommendations=new ExplorersRecommendationRepository(runtime);
  let before=await completeSqlSnapshot(fixtures,records);const collection=before.collections.find(r=>r.id===list),input={category,entityId:entity,collectionId:list,expectedCollectionRevision:Number(collection.revision)},createKey=randomUUID();
  const created=await recommendations.createRecommendation(f.account,input,createKey);f.allIds!.push(created.id);let after=await completeSqlSnapshot(fixtures,records);await recommendationSqlReceipt(f.account,'createRecommendation',input,createKey,created,before);categoryStatementDelta(before,after,f.account,category,3);
  expect(after.collections.find(r=>r.id===list)).toEqual({...collection,revision:String(BigInt(collection.revision)+1n),updated_at:after.collections.find(r=>r.id===list).updated_at});expect(after.collections.filter(r=>r.id!==list)).toEqual(before.collections.filter(r=>r.id!==list));
  expect(after.recommendations.filter(r=>r.id!==created.id)).toEqual(before.recommendations);expect(after.memberships.filter(r=>r.recommendation_id!==created.id)).toEqual(before.memberships);expect(after.inventory).toEqual(before.inventory);
  unchangedSqlFields(before,after,['collections','memberships','recommendations','categories','receipts']);
  before=after;const ratingInput={userRating:7},updateKey=randomUUID(),old=before.recommendations.find(r=>r.id===created.id),rated=await recommendations.updateRecommendation(f.account,created.id,created.revision,ratingInput,updateKey);after=await completeSqlSnapshot(fixtures,records);
  await recommendationSqlReceipt(f.account,'updateRecommendation',{id:created.id,expectedRevision:created.revision,input:ratingInput},updateKey,rated,before);categoryStatementDelta(before,after,f.account,category,1);
  const changed=after.recommendations.find(r=>r.id===created.id);expect(after.recommendations).toEqual(before.recommendations.map(r=>r.id===created.id?{...old,user_rating:7,revision:String(BigInt(old.revision)+1n),updated_at:changed.updated_at}:r));unchangedSqlFields(before,after,['recommendations','categories','receipts']);
  before=after;const order=[created.id,...ids.reverse()],parent=before.collections.find(r=>r.id===list),reorderKey=randomUUID(),reordered=await recommendations.reorderCollection(f.account,list,Number(parent.revision),order,reorderKey);after=await completeSqlSnapshot(fixtures,records);
  await recommendationSqlReceipt(f.account,'reorderCollection',{id:list,expectedRevision:Number(parent.revision),ids:order},reorderKey,reordered,before);categoryStatementDelta(before,after,f.account,category,4);
  expect(after.memberships.filter(r=>r.collection_id===list).map(r=>({id:r.recommendation_id,order:r.display_order}))).toEqual(order.map((id,displayOrder)=>({id,order:displayOrder})));
  expect(after.memberships).toEqual(before.memberships.map(r=>r.collection_id===list?{...r,display_order:order.indexOf(r.recommendation_id)}:r).sort((a,b)=>a.collection_id.localeCompare(b.collection_id)||a.display_order-b.display_order||a.recommendation_id.localeCompare(b.recommendation_id)));
  expect(after.memberships.filter(r=>r.collection_id!==list)).toEqual(before.memberships.filter(r=>r.collection_id!==list));expect(after.collections.find(r=>r.id===list)).toEqual({...parent,revision:String(BigInt(parent.revision)+1n),updated_at:after.collections.find(r=>r.id===list).updated_at});expect(after.collections.filter(r=>r.id!==list)).toEqual(before.collections.filter(r=>r.id!==list));unchangedSqlFields(before,after,['collections','memberships','categories','receipts']);
 });
 it.each(['books','games','apps'] as const)('raw %s two recommendation statements retain two category increments',async category=>{
  const {f,foreign,records,ids}=await historicalSqlFixture(category),fixtures=[f,foreign],before=await completeSqlSnapshot(fixtures,records),result=await rawSqlTransaction(async db=>{
   await db.query('UPDATE recommendations SET user_rating=6 WHERE id=$1',[ids[0]]);await db.query('UPDATE recommendations SET user_rating=7 WHERE id=$1',[ids[1]]);
  });expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot(fixtures,records);categoryStatementDelta(before,after,f.account,category,2);expect(after.recommendations).toEqual(before.recommendations.map(r=>ids.includes(r.id)?{...r,user_rating:r.id===ids[0]?6:7}:r));unchangedSqlFields(before,after,['recommendations','categories']);
 });
 it.each(['books','games','apps'] as const)('raw %s wrong entity kind rejects and preserves complete state',async category=>{
  const {f,foreign,records,ids}=await historicalSqlFixture(category),wrong=(await admin.query("INSERT INTO entities(kind,title,origin) VALUES('movie','Bare wrong kind','manual') RETURNING id")).rows[0].id;
  await rejectRawSql([f,foreign],records,async db=>{await db.query('UPDATE recommendations SET entity_id=$2 WHERE id=$1',[ids[0],wrong]);},['23514'],[wrong]);
 });
 it.each(['foreign operation owner','deactivate operation kind','pending operation state','future deletion date','NULL deletion date'] as const)('lifecycle purge rejects %s and preserves complete state',async variant=>{
  const {target:f,foreign,records}=await fullOwnedSqlFixture();await admin.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=$2 WHERE id=$1",[f.account,variant==='NULL deletion date'?null:variant==='future deletion date'?'2999-01-01T00:00:00.000Z':fixtureTime]);
  const operation=await lifecycleSqlOperation(variant==='foreign operation owner'?foreign.account:f.account,variant==='deactivate operation kind'?'deactivate':'delete',variant==='pending operation state'?'pending':'running');
  await rejectRawSql([f,foreign],records,async db=>{await db.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation]);},['42501']);
 });
 it('raw pinned recommendation deletion rejects and rolls cleanup back',async()=>{
  // RESTRICT is immediate; cleanup triggers must roll back with its failure.
  const f=await seed(3),foreign=await seed(1),records=[...await sqlSetup(f),...await sqlSetup(foreign)],before=await completeSqlSnapshot([f,foreign],records),result=await rawSqlTransaction(async db=>{await db.query('DELETE FROM recommendations WHERE id=$1',[f.ids[0]]);},{privileged:true});
  expect(result.code).toBe('23503');expect(result.error).toBeDefined();expect(result.committed).toBe(false);expect(await completeSqlSnapshot([f,foreign],records)).toEqual(before);
 });
 it('privileged recommendation deletion after membership removal preserves other scope',async()=>{
  const f=await seed(3),foreign=await seed(1),records=[...await sqlSetup(f),...await sqlSetup(foreign)],image=await readySqlAsset(admin,f.account);
  await admin.query('INSERT INTO recommendation_media(recommendation_id,account_id,media_id,display_order) VALUES($1,$2,$3,0)',[f.ids[0],f.account,image]);
  await admin.query('INSERT INTO place_recommendation_context(recommendation_id,account_id) VALUES($1,$2)',[f.ids[0],f.account]);
  await admin.query('INSERT INTO recommendation_place_photos(recommendation_id,account_id,slot_index,media_id) VALUES($1,$2,0,$3)',[f.ids[0],f.account,image]);
  await admin.query("INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,'{}')",[f.ids[0],f.account]);
  const entity=(await admin.query('SELECT entity_id FROM recommendations WHERE id=$1',[f.ids[0]])).rows[0].entity_id;f.entityIds=[entity];const before=await completeSqlSnapshot([f,foreign],records),result=await rawSqlTransaction(async db=>{
   await db.query('DELETE FROM collection_items WHERE recommendation_id=$1 AND collection_id=ANY($2::uuid[])',[f.ids[0],[f.list,f.otherList]]);await db.query('DELETE FROM recommendations WHERE id=$1',[f.ids[0]]);
  },{privileged:true});expect(result.error).toBeUndefined();expect(result.drained).toBe(true);expect(result.committed).toBe(true);
  const after=await completeSqlSnapshot([f,foreign],records),survivors=f.ids.slice(1);for(const list of [f.list,f.otherList])expect(await live(f,list)).toEqual(survivors.map((id,position)=>({id,position})));
  expect(after.pins).toEqual(before.pins.filter(r=>r.recommendation_id!==f.ids[0]).map(r=>r.account_id===f.account?{...r,position:String(survivors.indexOf(r.recommendation_id))}:r));expect(after.memberships).toEqual(before.memberships.filter(r=>r.recommendation_id!==f.ids[0]));expect(after.recommendations).toEqual(before.recommendations.filter(r=>r.id!==f.ids[0]));
  sqlCollectionDelta(before,after,[f.list,f.otherList],result.xid);sqlCategoryDelta(before,after,f.account,result.xid);
  const expectedInventory={...before.inventory};for(const table of ['recommendation_media','place_recommendation_context','recommendation_place_photos','recommendation_display_overrides'])expectedInventory[table]=before.inventory[table].filter(r=>r.recommendation_id!==f.ids[0]);expect(after.inventory).toEqual(expectedInventory);
  unchangedSqlFields(before,after,['collections','recommendations','memberships','pins','categories','markers','inventory']);
 });
});
