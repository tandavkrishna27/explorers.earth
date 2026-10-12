import {describe,it,expect,vi} from 'vitest';
import {PlacePinsBoundary} from '../../application/placePinsBoundary';
import {placePinsAvailabilitySchema} from '../../../shared/explorersPlacePinsContract';
import type {Actor} from '../../application/actor';
import {ExplorersPlacePinsRepository} from '../../repositories/explorersPlacePinsRepository';
import {hashPlacePinsRequest,createPlacePinsSequenceHasher,hashPlacePinsChunk} from '../../application/placePinsBoundary';
import {hashDraftSequence,PinWorkBudget,admittedStagingBytes} from '../../repositories/placePinsStorage';
import type {Pool,PoolClient} from 'pg';
import {ExplorersRecommendationRepository} from '../../repositories/explorersRecommendationRepository';
// Inert database clock and final-batch deadline model. No wall-clock resources.
function batchRemaining(sql:string){const timestamp=sql.match(/'([^']+)'::timestamptz-clock_timestamp\(\)/)?.[1];return timestamp?Math.floor(Date.parse(timestamp)-performance.now()):Infinity;}
function withCommandClock<T extends {query:(sql:string,...args:any[])=>Promise<any>}>(client:T):T {
 return {...client,query:async(sql:string,...args:any[])=>{
  if(sql==='SELECT clock_timestamp() AS command_clock')return {rows:[{command_clock:new Date(performance.now())}]};
  if(sql.startsWith('DO $places_deadline$')&&batchRemaining(sql)<=1)throw Object.assign(new Error('Server deadline expired'),{code:'57014'});
  return client.query(sql,...args);
 }} as T;
}
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const actor:Actor={accountId:id,userId:id,role:'owner',credential:{kind:'web-session',sessionId:id,sessionVersion:1}};
// Synthetic operational limits, fixture only; these are not product cardinality limits.
export const fixturePolicy={policyId:'fixture-only',policyVersion:1,transportChunkBytes:4096,transportChunkIds:32,replacementBytes:8192,replacementIds:64,ownerDraftQuota:2,ownerStagingBytes:100000,draftExpiryMs:1000,stagingRetentionMs:2000,receiptRetentionMs:3000,commitProcessingBytes:100000,commitProcessingMs:1000,commitWorkUnits:10000,cleanupBatchSize:10,cleanupWorkUnits:100};
describe('Places storage capability gate',()=>{
 it('accepts only the strict configured availability success',()=>{
  expect(placePinsAvailabilitySchema.safeParse({available:true,state:'configured',clientTransport:{policyId:'synthetic',policyVersion:1,replacementBytes:4096,replacementIds:80,transportChunkBytes:1024,transportChunkIds:20,ownerStagingBytes:20000,commitProcessingBytes:40000,commitProcessingMs:1000,commitWorkUnits:1000,draftExpiryMs:1000}}).success).toBe(true);
  expect(placePinsAvailabilitySchema.safeParse({available:true,state:'unconfigured'}).success).toBe(false);
  expect(placePinsAvailabilitySchema.safeParse({available:true,state:'configured',policyId:'secret'}).success).toBe(false);
 });
 it('resolves owned collection through storage only with approved complete policy',async()=>{
  const calls:unknown[]=[];
  const storage={execute:async(...args:unknown[])=>{calls.push(args);return {available:true,state:'configured'};}};
  const boundary=new PlacePinsBoundary(async()=>{},fixturePolicy,storage);
  expect(await boundary.execute(actor,{operation:'placePinsAvailability',collectionId:id},{requestId:id},0)).toEqual({available:true,state:'configured'});
  expect(calls).toHaveLength(1);
  expect(await new PlacePinsBoundary(async()=>{},undefined,storage).execute(actor,{operation:'placePinsAvailability',collectionId:id},{requestId:id},0)).toEqual({available:false,state:'unconfigured',reason:'STORAGE_UNAVAILABLE'});
  expect(calls).toHaveLength(1);
 });
});
describe('Places storage review regressions',()=>{
 it('cancels before persistence when configuration consumes t95 to t99 and deferred COMMIT reaches t103',async()=>{
  let now=0;let persisted=false;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const client={query:async(sql:string)=>{
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts')){now=95;return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:{changed:false}}]};}
   if(sql.includes('set_config')&&now===95)now=99;
   if(sql.startsWith('DO $places_deadline$')){
    now=99;const remaining=batchRemaining(sql);
    if(remaining<=1||remaining-1<=4){now=100;throw Object.assign(new Error('Deferred COMMIT canceled before persistence'),{code:'57014'});}
    now=103;persisted=true;
   }
   if(sql==='COMMIT'){now=103;persisted=true;}return {rows:[]};},release:()=>{}};
  try{await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,{...fixturePolicy,commitProcessingMs:100})).rejects.toMatchObject({status:413});
   expect(persisted).toBe(false);
  }finally{clock.mockRestore();}
 });
 it('rejects late deferred validation after a stalled statement transition before persistence',async()=>{
  let now=0,persisted=false,rolledBack=false;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const client={query:async(sql:string)=>{
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts')){now=90;return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:{changed:false}}]};}
   if(sql.startsWith('DO $places_deadline$')){
    now=93; // Unbounded transition consumes three milliseconds after timeout capture.
    now=101; // Deferred processing finishes under the stale nine millisecond timeout.
    if(sql.includes('SET CONSTRAINTS ALL IMMEDIATE;')&&sql.includes('DO $places_completion$'))throw Object.assign(new Error('Absolute completion fence rejects late validation'),{code:'57014'});
    persisted=true;
   }
   if(sql==='ROLLBACK')rolledBack=true;return {rows:[]};},release:()=>{}};
  try{await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,{...fixturePolicy,commitProcessingMs:100})).rejects.toMatchObject({status:413});expect(persisted).toBe(false);expect(rolledBack).toBe(true);}
  finally{clock.mockRestore();}
 });
 it('accepts pg multiple-result COMMIT batches without replacing the application replay result',async()=>{
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}},original={changed:false,pinCount:0};
  let commits=0;const client={query:async(sql:string)=>{
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts'))return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:original}]};
   if(sql.startsWith('DO $places_deadline$')){commits++;return [{command:'DO',rows:[]},{command:'COMMIT',rows:[]}];}return {rows:[]};},release:()=>{}};
  expect(await new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).toEqual(original);
  expect(commits).toBe(1);
 });
 it('denies an expired server expiry before COMMIT when the clock reply consumed the command window',async()=>{
  let now=0,persisted=false;const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const client={query:async(sql:string)=>{
   if(sql==='SELECT clock_timestamp() AS command_clock'){now=90;return {rows:[{command_clock:new Date(0)}]};}
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts'))return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:{changed:false}}]};
   if(sql.startsWith('DO $places_deadline$')){if(batchRemaining(sql)<=1)throw Object.assign(new Error('Expired server deadline'),{code:'57014'});persisted=true;}return {rows:[]};},release:()=>{}};
  try{await expect(new ExplorersPlacePinsRepository({connect:async()=>client} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,{...fixturePolicy,commitProcessingMs:100})).rejects.toMatchObject({status:413});expect(persisted).toBe(false);
  }finally{clock.mockRestore();}
 });
 it('sets COMMIT timeout from the same absolute deadline after receipt replay',async()=>{
  let now=0;const timeoutValues:number[]=[];const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const client={query:async(sql:string,args?:unknown[])=>{
   if(sql.includes('set_config'))timeoutValues.push(parseInt(String(args?.[0])));
   if(sql.startsWith('DO $places_deadline$'))timeoutValues.push(batchRemaining(sql)-1);
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts')){now=95;return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:{changed:false}}]};}
   return {rows:[]};},release:()=>{}};
  try{await new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,{...fixturePolicy,commitProcessingMs:100});
   expect(timeoutValues.at(-1)).toBeLessThanOrEqual(5);
  }finally{clock.mockRestore();}
 });
 it('admits the old live sequence before a zero clear performs comparison or deletion',async()=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('FROM collections'))return {rows:[{id,revision:'1',category:'places',archived_at:null}]};
   if(sql.includes('account_category_content_state'))return {rows:[{revision:'0'}]};
   if(sql.includes('count(*)')&&sql.includes('collection_place_pins'))return {rows:[{count:'2000'}]};
   if(sql.includes('changed'))return {rows:[{changed:true}]};return {rows:[]};},release:()=>{}};
  await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,{operation:'replacePlacePins',collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}},{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).rejects.toMatchObject({status:413});
  expect(calls.some(sql=>sql.startsWith('DELETE FROM collection_place_pins'))).toBe(false);
 });
 it('does not advance the owner cursor beyond owners whose cleanup work was not processed',async()=>{
  const owners=[id,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];const calls:string[]=[];
  const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('SELECT account_id FROM ('))return {rows:owners.map(account_id=>({account_id}))};return {rows:[],rowCount:0};},release:()=>{}};
  const result=await new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).cleanupExpired({...fixturePolicy,cleanupBatchSize:1,cleanupWorkUnits:1});
  expect(result.nextAccountId).not.toBe(owners[1]);
 });
 it('retains archived non-Places parents for recommendation archive while entity replacement keeps its active filter',async()=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.startsWith('SELECT category FROM recommendations'))return {rows:[{category:'books'}]};
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('SELECT c.id,c.revision,c.category'))return {rows:[{id,revision:2,category:'books'}]};
   if(sql.startsWith('SELECT * FROM recommendations'))return {rows:[{id,revision:1,category:'books'}]};
   if(sql.startsWith('SELECT revision FROM collections'))return {rows:[{revision:2}]};return {rows:[],rowCount:0};},release:()=>{}};
  await new ExplorersRecommendationRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).archiveRecommendation(id,id,1,'fixture-key');
  const parentQuery=calls.find(sql=>sql.includes('SELECT c.id,c.revision,c.category'))!;
  expect(parentQuery).not.toContain('AND c.archived_at IS NULL');
 });
 it('cancels before COMMIT when deadline expires while configuring its remaining timeout',async()=>{
  let now=0;const calls:string[]=[];const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const req={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
  const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('application_command_receipts')){now=99;return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(req),'hex'),status:'completed',replayable:true,response:{changed:false}}]};}
   if(sql.includes('set_config')&&now===99)now=101;return {rows:[]};},release:()=>{}};
  try{await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,req,{requestId:id,idempotencyKey:'fixture-key'},100,{...fixturePolicy,commitProcessingMs:100})).rejects.toMatchObject({status:413});
   expect(calls).not.toContain('COMMIT');expect(calls.at(-1)).toBe('ROLLBACK');
  }finally{clock.mockRestore();}
 });
 it('retains cumulative charges when tightening the original policy and across later SQL work',()=>{
  const budget=new PinWorkBudget(fixturePolicy);budget.charge(0,9);budget.configure({...fixturePolicy,commitWorkUnits:10});budget.charge(0,1);
  expect(()=>budget.charge(0,1)).toThrow();
 });
 it('admits only eligible draft states and resumes an unfinished owner by collection/draft key',async()=>{
  const draft='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',queries:{sql:string;args?:unknown[]}[]=[];
  const client={query:async(sql:string,args?:unknown[])=>{queries.push({sql,args});
   if(sql.includes('SELECT account_id FROM ('))return {rows:[{account_id:id}]};
   if(sql.includes('SELECT id,collection_id FROM place_pin_drafts'))return {rows:[{id:draft,collection_id:id}]};
   if(sql.includes('SELECT *,expires_at'))return {rows:[{id:draft,state:'open',expired:true,item_count:'0',chunk_count:'0'}]};
   if(sql.startsWith('SELECT EXISTS'))return {rows:[{pending:true}]};return {rows:[],rowCount:0};},release:()=>{}};
  const repository=new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool);
  const result=await repository.cleanupExpired({...fixturePolicy,cleanupBatchSize:2,cleanupWorkUnits:2});
  expect(result).toMatchObject({nextAccountId:null,continuation:{accountId:id,afterCollectionId:id,afterDraftId:draft}});
  const selection=queries.find(row=>row.sql.includes('SELECT id,collection_id FROM place_pin_drafts'))!;
  expect(selection.sql).toContain("state='open'");expect(selection.sql).toContain("state<>'open'");expect(selection.sql).toContain("policy_snapshot->>'stagingRetentionMs'");
  expect(selection.sql).toContain('(collection_id,id)>');
  queries.length=0;await repository.cleanupExpired({...fixturePolicy,cleanupBatchSize:2,cleanupWorkUnits:2},'00000000-0000-0000-0000-000000000000',result.continuation!);
  expect(queries.find(row=>row.sql.includes('SELECT id,collection_id FROM place_pin_drafts'))?.args?.slice(1,3)).toEqual([id,draft]);
 });
});
describe('transactional Places storage seams (no database allocation)',()=>{
 const request={operation:'replacePlacePins' as const,collectionId:id,body:{expectedCollectionRevision:1,expectedCategoryContentRevision:'0',orderedRecommendationIds:[]}};
 it('replays the original result before aggregate reads or live/staging writes',async()=>{
  const calls:string[]=[];const original={collectionId:id,collectionRevision:2,categoryContentRevision:'1',pinCount:0,changed:true};
  const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('SELECT status FROM creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('FROM application_command_receipts'))return {rows:[{request_hash:Buffer.from(hashPlacePinsRequest(request),'hex'),status:'completed',replayable:true,response:original}]};
   return {rows:[]};},release:()=>{}};
  const repo=new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool);
  expect(await repo.execute(id,request,{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).toEqual(original);
  expect(calls.some(sql=>sql.includes('FROM collections')||sql.includes('place_pin_drafts')||sql.startsWith('INSERT'))).toBe(false);
  expect(calls.at(-1)).toContain('COMMIT;');
 });
 it.each([{status:'retired',replayable:true},{status:'completed',replayable:false}])('retains historical key denial for %o',async receipt=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);return {rows:sql.includes('creator_accounts')?[{status:'active'}]:sql.includes('application_command_receipts')?[{...receipt,request_hash:Buffer.from(hashPlacePinsRequest(request),'hex')}]:[]};},release:()=>{}};
  await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,request,{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).rejects.toMatchObject({status:409});
  expect(calls.at(-1)).toBe('ROLLBACK');expect(calls.some(sql=>sql.startsWith('INSERT')||sql.includes('FROM collections'))).toBe(false);
 });
 it('streams more than one bounded page independently of transport chunks',async()=>{
  const ids=Array.from({length:257},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);let offset=0;
  const db={query:async(sql:string,args:unknown[])=>{expect(sql).toContain('LIMIT $4');expect(args[3]).toBe(128);const batch=ids.slice(offset,offset+128);offset+=batch.length;
   return {rows:batch.map((recommendation_id,index)=>({recommendation_id,chunk_index:0,item_index:offset-batch.length+index}))};}};
  const reference=createPlacePinsSequenceHasher();reference.append(ids);
  const result=await hashDraftSequence(db as unknown as Pick<PoolClient,'query'>,id,new PinWorkBudget(fixturePolicy));
  expect(result).toEqual({count:257,hash:reference.finish()});
 });
 it('charges actual bytes and fixed staging accounting with safe overflow rejection',()=>{
  expect(admittedStagingBytes(123,2)).toBe(251);
  expect(()=>admittedStagingBytes(Number.MAX_SAFE_INTEGER,1)).toThrow();
  expect(()=>new PinWorkBudget({...fixturePolicy,commitWorkUnits:1}).charge(0,2)).toThrow();
 });
 it('resolves addressed draft ownership before touching its participating recommendations',async()=>{
  const calls:string[]=[];
  const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('FROM collections'))return {rows:[{id,revision:1,category:'places',archived_at:null}]};
   if(sql.includes('FROM recommendations'))throw new Error('Unresolved draft leaked into member validation');
   return {rows:[]};},release:()=>{}};
  const hasher=createPlacePinsSequenceHasher();
  await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,{operation:'commitPlacePinsDraft',collectionId:id,draftId:id,body:{totalCount:0,sequenceHash:hasher.finish()}},{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).rejects.toMatchObject({status:404});
  expect(calls.some(sql=>sql.includes('FROM recommendations'))).toBe(false);
 });
 it('returns the immutable original chunk acknowledgement under a fresh key without charging staging twice',async()=>{
  const ids=[id],chunkHash=hashPlacePinsChunk(0,ids),ack={draftId:id,chunkIndex:0,chunkHash,acceptedCount:1,changed:true};const calls:string[]=[];
  const client={query:async(sql:string)=>{calls.push(sql);
   if(sql.includes('creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('FROM collections'))return {rows:[{id,revision:1,category:'places',archived_at:null}]};
   if(sql.includes('FROM place_pin_drafts'))return {rows:[{id,state:'open',expired:false,policy_snapshot:fixturePolicy}]};
   if(sql.includes('FROM place_pin_draft_chunks'))return {rows:[{hash:Buffer.from(chunkHash,'hex'),item_count:'1',acknowledgement:ack}]};
   if(sql.includes('FROM place_pin_draft_items'))return {rows:[{recommendation_id:id}]};return {rows:[]};},release:()=>{}};
  const result=await new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,{operation:'appendPlacePinsChunk',collectionId:id,draftId:id,chunkIndex:0,body:{recommendationIds:ids,chunkHash}},{requestId:id,idempotencyKey:'fixture-fresh-key'},100,fixturePolicy);
  expect(result).toEqual(ack);expect(calls.filter(sql=>sql.startsWith('INSERT'))).toHaveLength(1);
  expect(calls.some(sql=>sql.startsWith('UPDATE place_pin_drafts')||sql.includes('sum(accepted_bytes)'))).toBe(false);
  const receipt=calls.find(sql=>sql.startsWith('INSERT INTO application_command_receipts'))!;expect(receipt).toContain('replay_until');
 });
 it.each(['append','empty-commit'] as const)('uses permitted immutable child reads after parent locks for %s',async operation=>{
  const calls:string[]=[];const hasher=createPlacePinsSequenceHasher();
  const client={query:async(sql:string)=>{calls.push(sql);
   if(/FROM place_pin_draft_(chunks|items)\b/.test(sql)&&sql.includes('FOR UPDATE')&&!sql.includes('FROM recommendations'))throw Object.assign(new Error('Child UPDATE privilege deliberately denied'),{code:'42501'});
   if(sql.includes('SELECT status FROM creator_accounts'))return {rows:[{status:'active'}]};
   if(sql.includes('FROM collections'))return {rows:[{id,revision:1,category:'places',archived_at:null}]};
   if(sql.includes('account_category_content_state'))return {rows:[{revision:'0'}]};
   if(sql.includes('FROM place_pin_drafts')){
    if(sql.includes('sum(accepted_bytes)'))return {rows:[{drafts:'1',bytes:'0'}]};
    return {rows:[{id,collection_id:id,state:'open',expired:false,policy_snapshot:fixturePolicy,expected_collection_revision:'1',expected_category_content_revision:'0',accepted_bytes:'0',item_count:'0',chunk_count:'0'}]};
   }
   if(sql.includes('AS count FROM collection_place_pins'))return {rows:[{count:'0'}]};
   if(sql.includes('coalesce(min(chunk_index)'))return {rows:[{count:'0',first:'0',last:'-1',items:'0'}]};
   if(sql.includes(' changed'))return {rows:[{changed:false}]};
   return {rows:[],rowCount:0};},release:()=>{}};
  const request=operation==='append'?{operation:'appendPlacePinsChunk' as const,collectionId:id,draftId:id,chunkIndex:0,body:{recommendationIds:[id],chunkHash:hashPlacePinsChunk(0,[id])}}:{operation:'commitPlacePinsDraft' as const,collectionId:id,draftId:id,body:{totalCount:0,sequenceHash:hasher.finish()}};
  const result=await new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,request,{requestId:id,idempotencyKey:'fixture-permitted-children'},100,fixturePolicy);
  expect(result).toMatchObject(operation==='append'?{acceptedCount:1,changed:true}:{pinCount:0,changed:false});
  const account=calls.findIndex(sql=>sql.includes('SELECT status FROM creator_accounts')&&sql.includes('FOR UPDATE'));
  const collection=calls.findIndex(sql=>sql.includes('FROM collections')&&sql.includes('FOR UPDATE'));
  const draft=calls.findIndex(sql=>sql.includes('FROM place_pin_drafts')&&sql.includes('FOR UPDATE'));
  expect(account).toBeGreaterThanOrEqual(0);expect(collection).toBeGreaterThan(account);expect(draft).toBeGreaterThan(collection);
  const childReads=calls.map((sql,index)=>({sql,index})).filter(({sql})=>/^SELECT/.test(sql)&&/FROM place_pin_draft_(chunks|items)\b/.test(sql)&&!sql.includes('FROM recommendations')&&!sql.includes('LEFT JOIN recommendations'));
  expect(childReads.length).toBeGreaterThan(0);for(const {sql,index} of childReads){expect(index).toBeGreaterThan(draft);expect(sql).not.toContain('FOR UPDATE');}
  expect(calls.some(sql=>/^UPDATE place_pin_draft_(chunks|items)\b/.test(sql))).toBe(false);
  if(operation==='append')expect(calls.findIndex(sql=>sql.startsWith('INSERT INTO place_pin_draft_chunks'))).toBeGreaterThan(draft);
  else{expect(calls.findIndex(sql=>sql.startsWith('UPDATE place_pin_drafts SET state'))).toBeGreaterThan(draft);expect(calls.findIndex(sql=>sql.startsWith('DELETE FROM place_pin_draft_chunks'))).toBeGreaterThan(calls.findIndex(sql=>sql.startsWith('UPDATE place_pin_drafts SET state')));}
 });
 it('rolls back numeric storage exhaustion and classifies it as a resource failure',async()=>{
  const calls:string[]=[];const client={query:async(sql:string)=>{calls.push(sql);if(sql.includes('creator_accounts'))throw Object.assign(new Error('counter overflow'),{code:'22003'});return {rows:[]};},release:()=>{}};
  await expect(new ExplorersPlacePinsRepository({connect:async()=>withCommandClock(client)} as unknown as Pool).execute(id,request,{requestId:id,idempotencyKey:'fixture-key'},100,fixturePolicy)).rejects.toMatchObject({status:413,code:'RESOURCE_TOO_LARGE'});
  expect(calls.at(-1)).toBe('ROLLBACK');
 });
});
