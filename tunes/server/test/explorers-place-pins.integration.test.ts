import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {ExplorersPlacePinsRepository} from '../repositories/explorersPlacePinsRepository';
import {ExplorersRecommendationRepository} from '../repositories/explorersRecommendationRepository';
import {createPlacePinsSequenceHasher,hashPlacePinsChunk} from '../application/placePinsBoundary';
import type {PlacePinsRequest} from '../../shared/explorersPlacePinsContract';
import {lockContentCategories} from '../db/explorers-content-lock';
import {verifyMusicRuntimeLogin} from '../db/music-runtime-role';
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
type Fixture={account:string;list:string;otherList:string;ids:string[]};
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
async function waitBlockedBy(pid:number){const deadline=performance.now()+5000;
 while(performance.now()<deadline){if((await admin.query('SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) LIMIT 1',[pid])).rowCount)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected actual PostgreSQL barrier');}
async function waitDatabaseCondition(sql:string,args:unknown[]){const deadline=performance.now()+2000;
 while(performance.now()<deadline){if((await admin.query(sql,args)).rows[0]?.ready)return;await new Promise(resolve=>setTimeout(resolve,10));}throw new Error('Expected bounded database clock condition');}
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
  expect(await commit(f,draft.draftId,f.ids)).toMatchObject({pinCount:70,changed:true});expect((await live(f)).map(row=>row.id)).toEqual(f.ids);
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
  const f=await seed();await replace(f);await replace({...f,list:f.otherList});const otherBefore=await live(f,f.otherList),v=await versions(f);
  await runtime.query('DELETE FROM collection_items WHERE collection_id=$1 AND recommendation_id=$2',[f.list,f.ids[1]]);
  expect(await live(f)).toEqual([{id:f.ids[0],position:0},{id:f.ids[2],position:1}]);expect(await live(f,f.otherList)).toEqual(otherBefore);expect(await versions(f)).toEqual({collection:v.collection+1,category:v.category+1n});
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
  const f=await seed();await replace(f);const draft=await begin(f);expect(await commit(f,draft.draftId,[])).toMatchObject({changed:true,pinCount:0});
  const next=await begin(f),before=await versions(f);await append(f,next.draftId,0,f.ids);
  expect(await command(f,{operation:'abortPlacePinsDraft',collectionId:f.list,draftId:next.draftId,body:{}})).toMatchObject({changed:true});expect(await versions(f)).toEqual(before);
 });
 it('requires active account authority before a previously completed replay',async()=>{
  const f=await seed(),key=randomUUID(),request={operation:'replacePlacePins' as const,collectionId:f.list,body:{...await fences(f),orderedRecommendationIds:f.ids}};
  await command(f,request,key);await admin.query("UPDATE creator_accounts SET status='suspended' WHERE id=$1",[f.account]);await expect(command(f,request,key)).rejects.toMatchObject({status:404});
 });
 it('denies direct private marker writes and direct private helper execution',async()=>{
  const f=await seed();await expect(runtime.query('UPDATE account_category_content_state SET places_last_mutation_xid=pg_current_xact_id() WHERE account_id=$1',[f.account])).rejects.toMatchObject({code:'42501'});
  const functions=(await admin.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE '%place%pin%' AND p.proname<>'purge_explorers_account_content'")).rows;
  for(const fn of functions)expect((await runtime.query("SELECT has_function_privilege(current_user,$1,'EXECUTE') granted",[fn.signature])).rows[0].granted).toBe(false);
 });
 it('rolls back promotion and staging terminalization when receipt persistence fails',async()=>{
  const f=await seed(),draft=await begin(f);await append(f,draft.draftId,0,f.ids);const before=await versions(f);
  const failingPool={connect:async()=>{const db=await runtime.connect();return {query:async(sql:string,args?:unknown[])=>{
   if(sql.startsWith('INSERT INTO application_command_receipts'))throw new Error('Fixture rollback injection at receipt');return db.query(sql,args);},release:()=>db.release()};}} as unknown as pg.Pool;
  const hash=createPlacePinsSequenceHasher();hash.append(f.ids);
  await expect(new ExplorersPlacePinsRepository(failingPool).execute(f.account,{operation:'commitPlacePinsDraft',collectionId:f.list,draftId:draft.draftId,body:{totalCount:f.ids.length,sequenceHash:hash.finish()}},{requestId:randomUUID(),idempotencyKey:randomUUID()},100,policy)).rejects.toThrow('Fixture rollback injection');
  expect(await live(f)).toEqual([]);expect(await versions(f)).toEqual(before);
  expect((await admin.query('SELECT state,item_count FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'open',item_count:String(f.ids.length)});
  expect(await commit(f,draft.draftId,f.ids)).toMatchObject({changed:true});
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
  await expect(command(f,{operation:'placePinsAvailability',collectionId:foreign.list})).rejects.toMatchObject({status:404});
  const draft=await begin(f);
  await expect(command(f,{operation:'abortPlacePinsDraft',collectionId:f.otherList,draftId:draft.draftId,body:{}})).rejects.toMatchObject({status:404});
  await expect(replace(f,[foreign.ids[0]])).rejects.toMatchObject({status:422});expect(await live(f)).toEqual([]);
 });
 it('expires staging using the original policy, retains private terminal identities, then retires receipts without key reuse',async()=>{
  const f=await seed();const expiryPolicy={...policy,draftExpiryMs:100,stagingRetentionMs:200,receiptRetentionMs:400,cleanupBatchSize:100,cleanupWorkUnits:1000};
  const key=randomUUID(),request={operation:'beginPlacePinsDraft' as const,collectionId:f.list,body:await fences(f)};
  const draft=await command(f,request,key,expiryPolicy),before=await versions(f);
  await waitDatabaseCondition('SELECT expires_at<=clock_timestamp() ready FROM place_pin_drafts WHERE id=$1',[draft.draftId]);
  await expect(append(f,draft.draftId,0,f.ids)).rejects.toMatchObject({status:409});
  await repo.cleanupExpired(expiryPolicy);expect(await versions(f)).toEqual(before);
  expect((await admin.query('SELECT state,accepted_bytes FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rows[0]).toEqual({state:'expired',accepted_bytes:'0'});
  expect(await command(f,request,key,expiryPolicy)).toEqual(draft);
  await waitDatabaseCondition('SELECT terminal_at+interval \'200 milliseconds\'<=clock_timestamp() ready FROM place_pin_drafts WHERE id=$1',[draft.draftId]);
  await repo.cleanupExpired(expiryPolicy);expect((await admin.query('SELECT 1 FROM place_pin_drafts WHERE id=$1',[draft.draftId])).rowCount).toBe(0);
  await waitDatabaseCondition('SELECT replay_until<=clock_timestamp() ready FROM application_command_receipts WHERE account_id=$1 AND operation=\'beginPlacePinsDraft\'',[f.account]);
  await repo.cleanupExpired(expiryPolicy);
  expect((await admin.query('SELECT status,response FROM application_command_receipts WHERE account_id=$1 AND operation=\'beginPlacePinsDraft\'',[f.account])).rows[0]).toEqual({status:'retired',response:null});
  await expect(command(f,request,key,expiryPolicy)).rejects.toMatchObject({status:409});
 });
 it('keeps immediate foreign-key failure cleanup and category invalidation atomic',async()=>{
  const f=await seed(),foreign=await seed();await replace(f);const before=await versions(f);
  await expect(runtime.query('UPDATE recommendations SET account_id=$2 WHERE id=$1',[f.ids[1],foreign.account])).rejects.toMatchObject({code:'23503'});
  expect((await live(f)).map(row=>row.id)).toEqual(f.ids);expect(await versions(f)).toEqual(before);
 });
 it('guards lifecycle purge and retains tombstone category counters on retry',async()=>{
  const f=await seed();await replace(f);const draft=await begin(f);await append(f,draft.draftId,0,f.ids);
  const receipt=(await admin.query("INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,'delete',decode(repeat('02',32),'hex'),decode(repeat('02',32),'hex'),'{}') RETURNING id",[f.account])).rows[0].id;
  const feedback=(await admin.query("INSERT INTO deletion_feedback(account_id,reason) VALUES($1,'Fixture terminal delete') RETURNING id",[f.account])).rows[0].id;
  const operation=(await admin.query("INSERT INTO account_lifecycle_operations(account_id,kind,state,expected_revision,feedback_id,receipt_id) VALUES($1,'delete','running',1,$2,$3) RETURNING id",[f.account,feedback,receipt])).rows[0].id;
  await expect(runtime.query('SELECT purge_explorers_account_content($1,$2)',[f.account,operation])).rejects.toMatchObject({code:'42501'});
  await admin.query("UPDATE creator_accounts SET status='pending_deletion',deletion_requested_at=clock_timestamp() WHERE id=$1",[f.account]);
  expect((await runtime.query('SELECT purge_explorers_account_content($1,$2) removed',[f.account,operation])).rows[0].removed).toBe(2+f.ids.length);
  expect((await admin.query('SELECT count(*)::text count FROM place_pin_drafts WHERE account_id=$1',[f.account])).rows[0].count).toBe('0');
  expect((await admin.query('SELECT count(*)::text count FROM collection_place_pins WHERE account_id=$1',[f.account])).rows[0].count).toBe('0');
  const counter=(await admin.query("SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='places'",[f.account])).rows[0].revision;
  expect((await runtime.query('SELECT purge_explorers_account_content($1,$2) removed',[f.account,operation])).rows[0].removed).toBe(0);
  expect((await admin.query("SELECT revision FROM account_category_content_state WHERE account_id=$1 AND category='places'",[f.account])).rows[0].revision).toBe(counter);
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
  const short={...policy,ownerDraftQuota:10,draftExpiryMs:100,stagingRetentionMs:10000,receiptRetentionMs:20000,cleanupBatchSize:2,cleanupWorkUnits:2};
  const drafts:{f:Fixture;draftId:string}[]=[];
  for(const f of fixtures){
   const retained=await command(f,{operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)},randomUUID(),short);
   await command(f,{operation:'abortPlacePinsDraft',collectionId:f.list,draftId:retained.draftId,body:{}},randomUUID(),short);
   for(let i=0;i<3;i++){const open=await command(f,{operation:'beginPlacePinsDraft',collectionId:f.list,body:await fences(f)},randomUUID(),short);drafts.push({f,draftId:open.draftId});}
  }
  await waitDatabaseCondition('SELECT bool_and(expires_at<=clock_timestamp()) ready FROM place_pin_drafts WHERE account_id=ANY($1::uuid[]) AND state=\'open\'',[fixtures.map(f=>f.account)]);
  let after='00000000-0000-0000-0000-000000000000',resume:Parameters<ExplorersPlacePinsRepository['cleanupExpired']>[2];
  // Other fixtures in this suite may also be eligible. Calls remain bounded,
  // and continuation must advance until both target owners are drained.
  for(let calls=0;calls<100;calls++){
   const result=await repo.cleanupExpired(short,after,resume);
   if(result.nextAccountId)after=result.nextAccountId;resume=result.continuation??undefined;
   if((await admin.query("SELECT count(*)::text count FROM place_pin_drafts WHERE account_id=ANY($1::uuid[]) AND state='open'",[fixtures.map(f=>f.account)])).rows[0].count==='0')break;
   if(!result.nextAccountId&&!resume)after='00000000-0000-0000-0000-000000000000';
  }
  for(const target of drafts)expect((await admin.query('SELECT state FROM place_pin_drafts WHERE id=$1',[target.draftId])).rows[0].state).toBe('expired');
  for(const f of fixtures)expect((await admin.query("SELECT count(*)::text count FROM place_pin_drafts WHERE account_id=$1 AND state='aborted'",[f.account])).rows[0].count).toBe('1');
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
});
