import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import type {PlacePinsRequest} from '../../shared/explorersPlacePinsContract';
import type {RequestContext} from '../../shared/explorersContract';
import type {PlacePinsPolicy} from '../application/placePinsPolicy';
import {placePinsPolicySchema} from '../application/placePinsPolicy';
import {hashPlacePinsRequest,type PlacePinsStorage} from '../application/placePinsBoundary';
import {lockContentCategories} from '../db/explorers-content-lock';
import {admittedStagingBytes,checkPinFences,ownedPlaceCollection,pinFailure,pinResult,safeCounter,PinWorkBudget,hashDraftSequence,admitLivePinPass} from './placePinsStorage';
const digest=(value:string)=>createHash('sha256').update(value).digest();
type Draft={id:string;collection_id:string;expected_collection_revision:string;expected_category_content_revision:string;policy_snapshot:unknown;state:string;expires_at:Date;expired:boolean;item_count:string;chunk_count:string;accepted_bytes:string;terminal_result:unknown};
/** Constructor is inert. All maintenance and commands require an explicit policy;
 * there is no default policy, pool creation, background worker or listener. */
export class ExplorersPlacePinsRepository implements PlacePinsStorage {
 constructor(private readonly pool:Pool){}
 private async transaction<T>(policy:PlacePinsPolicy,work:(db:PoolClient)=>Promise<T>,budget=new PinWorkBudget(policy)):Promise<T>{
  const db=await this.pool.connect();
  // Earlier extended-protocol statements retain remaining timeouts and elapsed
  // checks. The final simple-protocol batch computes its timeout on the server
  // before forcing deferred validation, then checks absolute completion before COMMIT.
  const controlled={query:async(sql:string,args?:unknown[])=>{
   budget.charge(0,1);const remaining=budget.remainingMs();
   await db.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[`${remaining}ms`]);
   budget.remainingMs();return db.query(sql,args);
  }} as unknown as PoolClient;
  try {budget.remainingMs();await db.query('BEGIN');
   const clock=(await controlled.query('SELECT clock_timestamp() AS command_clock')).rows[0]?.command_clock;
   if(!(clock instanceof Date)||!Number.isFinite(clock.getTime()))pinFailure(413,'Database processing clock unavailable');
   // Snapshot + remaining AFTER the reply is conservative: response transit time
   // is excluded. Later policy tightening subtracts time; it never extends expiry.
   const establishedDeadline=budget.deadlineMs,serverExpiry=clock.getTime()+budget.remainingMs();
   const result=await work(controlled);budget.charge(0,1);
   const expiry=new Date(serverExpiry-(establishedDeadline-budget.deadlineMs));
   if(!Number.isFinite(expiry.getTime()))pinFailure(413,'Database processing deadline exceeds safe range');
   const timestamp=expiry.toISOString();
   // Only this internally generated ISO timestamp is interpolated; application
   // statements and caller values continue to use ordinary bound parameters.
   await db.query(`DO $places_deadline$ DECLARE remaining bigint; BEGIN
    remaining := floor(extract(epoch FROM ('${timestamp}'::timestamptz-clock_timestamp()))*1000);
    IF remaining<=1 THEN RAISE EXCEPTION 'Places processing deadline exhausted' USING ERRCODE='57014'; END IF;
    PERFORM set_config('statement_timeout',(remaining-1)::text||'ms',true);
    PERFORM set_config('lock_timeout',(remaining-1)::text||'ms',true);
   END $places_deadline$; SET CONSTRAINTS ALL IMMEDIATE;
   DO $places_completion$ BEGIN
    IF clock_timestamp()>='${timestamp}'::timestamptz THEN
     RAISE EXCEPTION 'Places processing completion deadline exhausted' USING ERRCODE='57014';
    END IF;
   END $places_completion$; COMMIT;`);
   // SET CONSTRAINTS drains all pending deferred triggers, including queue effects.
   // The completion fence follows validation with no subsequent application DML.
   // pg simple-protocol batches return multiple results. None is interpreted as
   // an application result, and no failure is reported after successful COMMIT.
   return result;
  }catch(error){await db.query('ROLLBACK');const failure=error as {code?:string;constraint?:string};
   if(['57014','55P03','22003'].includes(failure.code??'')||failure.code==='23514'&&['collections_revision_check','account_category_content_state_revision_check'].includes(failure.constraint??''))pinFailure(413,'Places pin processing or numeric budget exhausted');throw error;}finally{db.release();}
 }
 async execute(accountId:string,request:PlacePinsRequest,context:RequestContext,bodyBytes:number,policy:PlacePinsPolicy):Promise<unknown>{
  policy=placePinsPolicySchema.parse(policy);
  const budget=new PinWorkBudget(policy);
  return this.transaction(policy,async db=>{
   const account=(await db.query('SELECT status FROM creator_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];
   if(account?.status!=='active')pinFailure(404,'Account unavailable');
   const key=context.idempotencyKey;
   if(request.operation!=='placePinsAvailability'){
    if(!key||!/^[A-Za-z0-9._~-]{8,200}$/.test(key))pinFailure(422,'Idempotency key required');
    const receipt=(await db.query(`SELECT request_hash,response,status,replay_until>clock_timestamp() replayable FROM application_command_receipts
      WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3 FOR UPDATE`,[accountId,request.operation,digest(key)])).rows[0];
    if(receipt){if(!receipt.request_hash.equals(Buffer.from(hashPlacePinsRequest(request),'hex'))||receipt.status!=='completed'||!receipt.replayable){
      // Conflict rolls back, so expiry retirement is separately bounded maintenance.
      pinFailure(409,'Idempotency conflict');}return receipt.response;}
   }
   await lockContentCategories(db,accountId,['places']);
   const collection=await ownedPlaceCollection(db,accountId,request.collectionId);
   if(request.operation==='placePinsAvailability')return {available:true,state:'configured'};
   let result:unknown,receiptRetentionMs=policy.receiptRetentionMs;
   if(request.operation==='replacePlacePins'){
    await checkPinFences(db,accountId,collection,request.body.expectedCollectionRevision,request.body.expectedCategoryContentRevision);
    if(bodyBytes>policy.replacementBytes||request.body.orderedRecommendationIds.length>policy.replacementIds)pinFailure(413,'Replacement transport budget exceeded');
    result=await this.replace(db,accountId,request.collectionId,request.body.orderedRecommendationIds,budget);
   }else if(request.operation==='beginPlacePinsDraft'){
    await checkPinFences(db,accountId,collection,request.body.expectedCollectionRevision,request.body.expectedCategoryContentRevision);
    await this.reserve(db,accountId,policy,0,true);
    const id=randomUUID();const row=(await db.query(`INSERT INTO place_pin_drafts(id,account_id,category,collection_id,expected_collection_revision,
     expected_category_content_revision,policy_id,policy_version,policy_snapshot,created_at,expires_at,state,accepted_bytes,item_count,chunk_count)
     VALUES($1,$2,'places',$3,$4,$5,$6,$7,$8,clock_timestamp(),clock_timestamp()+$9::bigint*interval '1 millisecond','open',0,0,0) RETURNING expires_at`,
     [id,accountId,request.collectionId,request.body.expectedCollectionRevision,request.body.expectedCategoryContentRevision,policy.policyId,policy.policyVersion,JSON.stringify(policy),policy.draftExpiryMs])).rows[0];
    result={collectionId:request.collectionId,draftId:id,...request.body,expiresAt:row.expires_at.toISOString(),policyId:policy.policyId,policyVersion:policy.policyVersion};
   }else{
    if(request.operation==='commitPlacePinsDraft'){
     const addressed=(await db.query('SELECT *,expires_at<=clock_timestamp() expired FROM place_pin_drafts WHERE id=$1 AND account_id=$2 AND collection_id=$3',[request.draftId,accountId,request.collectionId])).rows[0];
     if(!addressed)pinFailure(404,'Draft unavailable');
     if(addressed.state!=='open'||addressed.expired)pinFailure(409,'Draft is terminal or expired');
     await checkPinFences(db,accountId,collection,addressed.expected_collection_revision,addressed.expected_category_content_revision);
     const original=placePinsPolicySchema.parse(addressed.policy_snapshot);
     budget.configure(original);budget.charge(safeCounter(addressed.accepted_bytes),safeCounter(addressed.item_count)+safeCounter(addressed.chunk_count));
     await this.lockMembers(db,accountId,request.collectionId,'SELECT recommendation_id FROM place_pin_draft_items WHERE draft_id=$1',[request.draftId]);
    }
    const draft=(await db.query(`SELECT *,expires_at<=clock_timestamp() expired FROM place_pin_drafts WHERE id=$1 AND account_id=$2 AND collection_id=$3 FOR UPDATE`,[request.draftId,accountId,request.collectionId])).rows[0] as Draft|undefined;
    if(!draft)pinFailure(404,'Draft unavailable');
    const original=placePinsPolicySchema.parse(draft.policy_snapshot);receiptRetentionMs=original.receiptRetentionMs;budget.configure(original);
    // Original policy snapshot and fences are immutable throughout the draft.
    if(request.operation==='abortPlacePinsDraft'){
     const changed=draft.state==='open';
     if(changed){budget.charge(safeCounter(draft.item_count)*64,safeCounter(draft.item_count)+safeCounter(draft.chunk_count));await this.terminalize(db,draft.id,'aborted',{draftId:draft.id,changed});}
     result={draftId:draft.id,changed};
    }else{
     if(draft.state!=='open'||draft.expired)pinFailure(409,'Draft is terminal or expired');
     if(request.operation==='appendPlacePinsChunk')result=await this.append(db,accountId,draft,request,bodyBytes,original);
     else{
      await checkPinFences(db,accountId,collection,draft.expected_collection_revision,draft.expected_category_content_revision);
      result=await this.commit(db,accountId,draft,request,budget);
      budget.charge(safeCounter(draft.item_count)*64,safeCounter(draft.item_count)+safeCounter(draft.chunk_count));
      await this.terminalize(db,draft.id,'committed',result);
     }
    }
   }
   budget.charge(0,0);
   await db.query(`INSERT INTO application_command_receipts(account_id,operation,idempotency_key_hash,request_hash,response,replay_until)
    VALUES($1,$2,$3,$4,$5,clock_timestamp()+$6::bigint*interval '1 millisecond')`,[accountId,request.operation,digest(key!),Buffer.from(hashPlacePinsRequest(request),'hex'),JSON.stringify(result),receiptRetentionMs]);
   budget.charge(0,0);return result;
  },budget);
 }
 private async reserve(db:PoolClient,accountId:string,policy:PlacePinsPolicy,bytes:number,newDraft:boolean){
  // Account row is held. Expired bulky data remains charged until explicit cleanup.
  const totals=(await db.query(`SELECT count(*) FILTER(WHERE state='open')::text drafts,coalesce(sum(accepted_bytes),0)::text bytes FROM place_pin_drafts WHERE account_id=$1`,[accountId])).rows[0];
  if(safeCounter(totals.drafts)+(newDraft?1:0)>policy.ownerDraftQuota||safeCounter(safeCounter(totals.bytes)+bytes)>policy.ownerStagingBytes)pinFailure(413,'Owner staging quota exceeded');
 }
 private async append(db:PoolClient,accountId:string,draft:Draft,request:Extract<PlacePinsRequest,{operation:'appendPlacePinsChunk'}>,bodyBytes:number,policy:PlacePinsPolicy){
  const ids=request.body.recommendationIds;
  if(bodyBytes>policy.transportChunkBytes||ids.length>policy.transportChunkIds)pinFailure(413,'Chunk transport budget exceeded');
  // Account, collection and draft are held. Child writes must lock this draft
  // through the immutable guard; SELECT needs no child UPDATE privilege.
  const prior=(await db.query('SELECT hash,item_count,acknowledgement FROM place_pin_draft_chunks WHERE draft_id=$1 AND chunk_index=$2',[draft.id,request.chunkIndex])).rows[0];
  if(prior){
   const content=(await db.query('SELECT recommendation_id FROM place_pin_draft_items WHERE draft_id=$1 AND chunk_index=$2 ORDER BY item_index',[draft.id,request.chunkIndex])).rows;
   if(!prior.hash.equals(Buffer.from(request.body.chunkHash,'hex'))||safeCounter(prior.item_count)!==ids.length||content.length!==ids.length||content.some((row,index)=>row.recommendation_id!==ids[index]))pinFailure(409,'Chunk content conflict');
   return prior.acknowledgement;
  }
  const bytes=admittedStagingBytes(bodyBytes,ids.length);await this.reserve(db,accountId,policy,bytes,false);
  const result={draftId:draft.id,chunkIndex:request.chunkIndex,chunkHash:request.body.chunkHash,acceptedCount:ids.length,changed:true};
  await db.query('INSERT INTO place_pin_draft_chunks(draft_id,chunk_index,hash,item_count,admitted_bytes,acknowledgement) VALUES($1,$2,$3,$4,$5,$6)',[draft.id,request.chunkIndex,Buffer.from(request.body.chunkHash,'hex'),ids.length,bytes,JSON.stringify(result)]);
  for(let i=0;i<ids.length;i++)await db.query('INSERT INTO place_pin_draft_items(draft_id,chunk_index,item_index,recommendation_id) VALUES($1,$2,$3,$4)',[draft.id,request.chunkIndex,i,ids[i]]);
  await db.query('UPDATE place_pin_drafts SET accepted_bytes=$2,item_count=$3,chunk_count=$4 WHERE id=$1',[draft.id,safeCounter(safeCounter(draft.accepted_bytes)+bytes),safeCounter(safeCounter(draft.item_count)+ids.length),safeCounter(safeCounter(draft.chunk_count)+1)]);
  return result;
 }
 private async lockMembers(db:PoolClient,accountId:string,collectionId:string,source:string,args:unknown[]){
  // Collection is already locked. Recommendations are always acquired in UUID order.
  await db.query(`SELECT count(*) FROM (SELECT r.id FROM recommendations r WHERE r.id IN (${source}) ORDER BY r.id FOR UPDATE) locked`,args);
  const invalid=(await db.query(`SELECT 1 FROM (${source}) wanted LEFT JOIN recommendations r ON r.id=wanted.recommendation_id
   LEFT JOIN collection_items ci ON ci.recommendation_id=r.id AND ci.collection_id=$${args.length+1}
   WHERE r.id IS NULL OR r.account_id<>$${args.length+2} OR r.category<>'places' OR r.archived_at IS NOT NULL OR ci.recommendation_id IS NULL LIMIT 1`,[...args,collectionId,accountId])).rows;
  if(invalid.length)pinFailure(422,'Pinned recommendation is not an active owned Places member');
 }
 private async replace(db:PoolClient,accountId:string,collectionId:string,ids:readonly string[],budget:PinWorkBudget){
  const oldCount=await admitLivePinPass(db,collectionId,budget);
  budget.charge(ids.length*64,ids.length+1);
  await this.lockMembers(db,accountId,collectionId,'SELECT unnest($1::uuid[]) recommendation_id',[ids]);
  const changed=(await db.query(`SELECT EXISTS(SELECT 1 FROM (SELECT recommendation_id,ordinality-1 position FROM unnest($2::uuid[]) WITH ORDINALITY AS x(recommendation_id,ordinality)) wanted
   FULL JOIN (SELECT recommendation_id,position FROM collection_place_pins WHERE collection_id=$1) live USING(recommendation_id,position) WHERE wanted.recommendation_id IS NULL OR live.recommendation_id IS NULL) changed`,[collectionId,ids])).rows[0].changed;
  if(changed){budget.charge(safeCounter((oldCount+ids.length)*64),safeCounter(oldCount+ids.length));await db.query('DELETE FROM collection_place_pins WHERE collection_id=$1',[collectionId]);
   await db.query(`INSERT INTO collection_place_pins(collection_id,recommendation_id,account_id,category,position)
    SELECT $1,recommendation_id,$2,'places',ordinality-1 FROM unnest($3::uuid[]) WITH ORDINALITY AS x(recommendation_id,ordinality)`,[collectionId,accountId,ids]);}
  budget.charge(ids.length*64,ids.length);return pinResult(db,accountId,collectionId,changed);
 }
 private async commit(db:PoolClient,accountId:string,draft:Draft,request:Extract<PlacePinsRequest,{operation:'commitPlacePinsDraft'}>,budget:PinWorkBudget){
  const oldCount=await admitLivePinPass(db,draft.collection_id,budget);
  // Parent draft serialization protects immutable children; retain bounded
  // count reads and work admission without requiring child UPDATE privilege.
  await db.query('SELECT count(*) FROM (SELECT chunk_index FROM place_pin_draft_chunks WHERE draft_id=$1 ORDER BY chunk_index) admitted',[draft.id]);
  await db.query('SELECT count(*) FROM (SELECT chunk_index,item_index FROM place_pin_draft_items WHERE draft_id=$1 ORDER BY chunk_index,item_index) admitted',[draft.id]);
  const shape=(await db.query(`SELECT count(*)::text count,coalesce(min(chunk_index),0)::text first,coalesce(max(chunk_index),-1)::text last,
    coalesce(sum(item_count),0)::text items FROM place_pin_draft_chunks WHERE draft_id=$1`,[draft.id])).rows[0];
  const chunks=safeCounter(shape.count);
  if(chunks!==safeCounter(draft.chunk_count)||(chunks&&(Number(shape.first)!==0||Number(shape.last)!==chunks-1))||safeCounter(shape.items)!==safeCounter(draft.item_count))pinFailure(422,'Incomplete chunk sequence');
  const bad=(await db.query(`SELECT 1 FROM place_pin_draft_chunks c LEFT JOIN place_pin_draft_items i USING(draft_id,chunk_index) WHERE c.draft_id=$1
   GROUP BY c.chunk_index,c.item_count HAVING count(i.item_index)<>c.item_count OR (c.item_count>0 AND (min(i.item_index)<>0 OR max(i.item_index)<>c.item_count-1))
   UNION ALL SELECT 1 FROM place_pin_draft_items WHERE draft_id=$1 GROUP BY recommendation_id HAVING count(*)>1 LIMIT 1`,[draft.id])).rows;
  if(bad.length)pinFailure(422,'Incomplete or duplicate staged sequence');
  const sequence=await hashDraftSequence(db,draft.id,budget);
  if(sequence.count!==request.body.totalCount||sequence.hash!==request.body.sequenceHash||sequence.count!==safeCounter(draft.item_count))pinFailure(422,'Sequence count or hash mismatch');
  budget.charge(sequence.count*64,sequence.count);
  const changed=(await db.query(`SELECT EXISTS(SELECT 1 FROM (SELECT recommendation_id,row_number() OVER(ORDER BY chunk_index,item_index)-1 position FROM place_pin_draft_items WHERE draft_id=$2) wanted
   FULL JOIN (SELECT recommendation_id,position FROM collection_place_pins WHERE collection_id=$1) live USING(recommendation_id,position) WHERE wanted.recommendation_id IS NULL OR live.recommendation_id IS NULL) changed`,[draft.collection_id,draft.id])).rows[0].changed;
  if(changed){budget.charge(safeCounter((oldCount+sequence.count)*64),safeCounter(oldCount+sequence.count));await db.query('DELETE FROM collection_place_pins WHERE collection_id=$1',[draft.collection_id]);
   await db.query(`INSERT INTO collection_place_pins(collection_id,recommendation_id,account_id,category,position)
    SELECT $1,recommendation_id,$2,'places',row_number() OVER(ORDER BY chunk_index,item_index)-1 FROM place_pin_draft_items WHERE draft_id=$3`,[draft.collection_id,accountId,draft.id]);}
  budget.charge(sequence.count*64,sequence.count);return pinResult(db,accountId,draft.collection_id,changed);
 }
 private async terminalize(db:PoolClient,id:string,state:string,result:unknown){
  await db.query('UPDATE place_pin_drafts SET state=$2,terminal_at=clock_timestamp(),terminal_result=$3,accepted_bytes=0,item_count=0,chunk_count=0 WHERE id=$1',[id,state,JSON.stringify(result)]);
  await db.query('DELETE FROM place_pin_draft_chunks WHERE draft_id=$1',[id]);
 }
 /** Explicit bounded maintenance. Owner selection is keyset ordered and inert until called. */
 async cleanupExpired(policy:PlacePinsPolicy,afterAccountId='00000000-0000-0000-0000-000000000000',resume?:{accountId:string;afterCollectionId:string;afterDraftId:string}){
  policy=placePinsPolicySchema.parse(policy);let work=0,removed=0,nextAccountId:string|null=null;
  let continuation:typeof resume|null=null;
  const zero='00000000-0000-0000-0000-000000000000';
  const eligible="((state='open' AND expires_at<=clock_timestamp()) OR (state<>'open' AND terminal_at<=clock_timestamp()-(policy_snapshot->>'stagingRetentionMs')::bigint*interval '1 millisecond'))";
  const owners=(await this.transaction(policy,db=>db.query(`SELECT account_id FROM (SELECT account_id FROM place_pin_drafts WHERE ${eligible} UNION SELECT account_id FROM application_command_receipts
   WHERE operation IN ('replacePlacePins','beginPlacePinsDraft','appendPlacePinsChunk','commitPlacePinsDraft','abortPlacePinsDraft') AND status='completed' AND replay_until<=clock_timestamp()) owners
   WHERE account_id>$1 OR account_id=$3::uuid ORDER BY account_id LIMIT $2`,[afterAccountId,policy.cleanupBatchSize,resume?.accountId??null]))).rows;
  for(const owner of owners){if(work>=policy.cleanupWorkUnits)break;work++;
   const complete=await this.transaction(policy,async db=>{
    await db.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[owner.account_id]);await lockContentCategories(db,owner.account_id,['places']);
    let afterCollectionId=resume&&resume.accountId===owner.account_id?resume.afterCollectionId:zero;
    let afterDraftId=resume&&resume.accountId===owner.account_id?resume.afterDraftId:zero;
    while(work<policy.cleanupWorkUnits){
    const drafts=(await db.query(`SELECT id,collection_id FROM place_pin_drafts WHERE account_id=$1 AND ${eligible}
      AND (collection_id,id)>($2::uuid,$3::uuid) ORDER BY collection_id,id LIMIT $4`,[owner.account_id,afterCollectionId,afterDraftId,Math.min(policy.cleanupBatchSize,policy.cleanupWorkUnits-work)])).rows;
    if(!drafts.length)break;
    for(const id of Array.from(new Set(drafts.map(row=>row.collection_id))).sort())await db.query('SELECT id FROM collections WHERE id=$1 FOR UPDATE',[id]);
    for(const candidate of drafts){work++;
     const row=(await db.query(`SELECT *,expires_at<=clock_timestamp() expired,terminal_at<=clock_timestamp()-(policy_snapshot->>'stagingRetentionMs')::bigint*interval '1 millisecond' retireable FROM place_pin_drafts WHERE id=$1 FOR UPDATE`,[candidate.id])).rows[0];
     afterCollectionId=candidate.collection_id;afterDraftId=candidate.id;
     if(!row)continue;if(row.state==='open'&&row.expired){await this.terminalize(db,row.id,'expired',null);removed++;}
     else if(row.state!=='open'&&row.retireable){await db.query('DELETE FROM place_pin_drafts WHERE id=$1',[row.id]);removed++;}
    }
    }
    if(work<policy.cleanupWorkUnits){const retired=await db.query(`WITH candidates AS (SELECT account_id,operation,idempotency_key_hash FROM application_command_receipts
      WHERE account_id=$1 AND operation IN ('replacePlacePins','beginPlacePinsDraft','appendPlacePinsChunk','commitPlacePinsDraft','abortPlacePinsDraft')
      AND status='completed' AND replay_until<=clock_timestamp() ORDER BY operation,idempotency_key_hash LIMIT $2 FOR UPDATE)
      UPDATE application_command_receipts r SET status='retired',response=NULL FROM candidates c WHERE r.account_id=c.account_id AND r.operation=c.operation AND r.idempotency_key_hash=c.idempotency_key_hash`,[owner.account_id,Math.min(policy.cleanupBatchSize,policy.cleanupWorkUnits-work)]);work+=retired.rowCount??0;}
    const pending=(await db.query(`SELECT EXISTS(SELECT 1 FROM place_pin_drafts WHERE account_id=$1 AND ${eligible}) OR EXISTS(
     SELECT 1 FROM application_command_receipts WHERE account_id=$1 AND operation IN ('replacePlacePins','beginPlacePinsDraft','appendPlacePinsChunk','commitPlacePinsDraft','abortPlacePinsDraft') AND status='completed' AND replay_until<=clock_timestamp()) pending`,[owner.account_id])).rows[0]?.pending;
    if(pending){
     // Restart from zero if only earlier entries became eligible while resuming.
     const later=(await db.query(`SELECT EXISTS(SELECT 1 FROM place_pin_drafts WHERE account_id=$1 AND ${eligible} AND (collection_id,id)>($2::uuid,$3::uuid)) pending`,[owner.account_id,afterCollectionId,afterDraftId])).rows[0]?.pending;
     continuation={accountId:owner.account_id,afterCollectionId:later?afterCollectionId:zero,afterDraftId:later?afterDraftId:zero};return false;
    }
    return true;
   });
   if(!complete)break;nextAccountId=owner.account_id;
  }
  // nextAccountId is exclusively the last fully drained owner. Pass continuation
  // back on the next call; null nextAccountId on a partial first owner means zero.
  return {removed,nextAccountId,continuation};
 }
}
