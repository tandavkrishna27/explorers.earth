import pg from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {ExplorersPlacePinsRepository} from '../repositories/explorersPlacePinsRepository';
import {ExplorersRecommendationRepository} from '../repositories/explorersRecommendationRepository';
import {createPlacePinsSequenceHasher,hashPlacePinsChunk} from '../application/placePinsBoundary';
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
