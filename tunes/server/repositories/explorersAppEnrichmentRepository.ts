import {createHash,randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {contentIdSchema} from '../../shared/explorersContract';
import {appSourceIdentitySchema,appSnapshotSchema,appBindingSchema,appGenerationSchema,appEntitlementSchema,appEnrichmentCommandSchema,appBindingResultSchema,appAcceptanceResultSchema,appAcceptanceRecordSchema,type AppBinding,type AppGeneration,type AppSnapshot} from '../../shared/explorersAppEnrichmentContract';
import {canonicalAppJson,hashAppSnapshot,mergeAppSnapshot,validateAppAcceptance,AppAcceptanceValidationError} from '../application/appEnrichmentValidation';
import {lockContentCategories} from '../db/explorers-content-lock';
import {RecommendationFailure} from './explorersRecommendationRepository';

type Source=ReturnType<typeof appSourceIdentitySchema.parse>;
type Command=ReturnType<typeof appEnrichmentCommandSchema.parse>;
export type AppEnrichmentResult=ReturnType<typeof appBindingResultSchema.parse>|ReturnType<typeof appAcceptanceResultSchema.parse>;
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest();
const bindingDto=(row:any):AppBinding=>appBindingSchema.parse({bindingId:row.id,accountId:row.account_id,recommendationId:row.recommendation_id,appEntityId:row.app_entity_id,optIn:row.opt_in,bindingRevision:Number(row.binding_revision),currentGenerationId:row.current_generation_id});
const generationDto=(row:any):AppGeneration=>appGenerationSchema.parse({generationId:row.id,bindingId:row.binding_id,accountId:row.account_id,recommendationId:row.recommendation_id,appEntityId:row.app_entity_id,sourceId:row.source_id,sourceIdentity:row.source_identity,sourceIdentityHash:row.source_identity_hash,canonicalizationVersion:row.canonicalization_version,createdAt:new Date(row.created_at).toISOString()});
const sameSource=(a:Source,b:Source)=>['sourceId','sourceIdentity','sourceIdentityHash','canonicalizationVersion'].every(key=>a[key as keyof Source]===b[key as keyof Source]);
function fail(status:404|409|422,message:string):never {throw new RecommendationFailure(status,message);}
/** Internal boundary. The application must establish current Actor authority before every call, including replay. */
export class ExplorersAppEnrichmentRepository {
 private readonly sources:readonly Source[];
 constructor(private readonly pool:Pool,approvedSources:readonly unknown[]=[]){
  this.sources=Object.freeze(approvedSources.map(value=>Object.freeze(appSourceIdentitySchema.parse(value))));
  if(new Set(this.sources.map(canonicalAppJson)).size!==this.sources.length)fail(422,'Duplicate source configuration');
 }
 static snapshotForStorage(input:unknown):AppSnapshot {
  const snapshot=appSnapshotSchema.parse(input);
  if(hashAppSnapshot(snapshot)!==snapshot.contentHash)fail(422,'Snapshot hash mismatch');
  return snapshot;
 }
 private parse(accountId:string,recommendationId:string,actorUserId:string,input:unknown,key:string):Command {
  try{contentIdSchema.parse(accountId);contentIdSchema.parse(recommendationId);contentIdSchema.parse(actorUserId);if(!/^[A-Za-z0-9._~-]{8,200}$/.test(key))fail(422,'Idempotency key required');return appEnrichmentCommandSchema.parse(input);}
  catch(error){if(error instanceof RecommendationFailure)throw error;return fail(422,'Invalid enrichment command');}
 }
 private async owned(db:PoolClient,accountId:string,recommendationId:string,lock=false){
  const row=(await db.query(`SELECT r.*,e.kind,e.origin FROM recommendations r JOIN entities e ON e.id=r.entity_id WHERE r.id=$1 AND r.account_id=$2 ${lock?'FOR UPDATE OF r':''}`,[recommendationId,accountId])).rows[0];
  if(!row)fail(404,'Recommendation unavailable');
  if(row.category!=='apps'||row.kind!=='app'||row.origin!=='manual')fail(422,'Manual app recommendation required');
  return row;
 }
 private async categoryRevision(db:PoolClient,accountId:string):Promise<string>{return String((await db.query("SELECT coalesce((SELECT revision::text FROM account_category_content_state WHERE account_id=$1 AND category='apps'),'0') revision",[accountId])).rows[0].revision);}
 // Immutable facts need no row lock: the account/category/recommendation/binding lock chain fences all current changes.
 private async generation(db:PoolClient,binding:AppBinding):Promise<{value:AppGeneration;retired:boolean}>{
  if(!binding.currentGenerationId)fail(409,'Generation unavailable');
  const row=(await db.query('SELECT g.*,EXISTS(SELECT 1 FROM app_enrichment_generation_retirements t WHERE t.generation_id=g.id) retired FROM app_enrichment_generations g WHERE g.id=$1',[binding.currentGenerationId])).rows[0];
  if(!row)fail(409,'Generation unavailable');return {value:generationDto(row),retired:row.retired};
 }
 private async insertGeneration(db:PoolClient,binding:AppBinding,source:Source):Promise<string>{
  const id=randomUUID();await db.query(`INSERT INTO app_enrichment_generations(id,binding_id,account_id,recommendation_id,app_entity_id,source_id,source_identity,source_identity_hash,canonicalization_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[id,binding.bindingId,binding.accountId,binding.recommendationId,binding.appEntityId,source.sourceId,source.sourceIdentity,source.sourceIdentityHash,source.canonicalizationVersion]);return id;
 }
 async execute(accountId:string,recommendationId:string,input:unknown,trustedActorUserId:string,context:{idempotencyKey:string}):Promise<AppEnrichmentResult>{
  const command=this.parse(accountId,recommendationId,trustedActorUserId,input,context.idempotencyKey);
  if((command.operation==='configureAppEnrichment'||command.operation==='rebindAppEnrichment')&&!this.sources.some(source=>sameSource(source,command)))fail(422,'Source configuration unavailable');
  const db=await this.pool.connect();
  try{
   await db.query('BEGIN');await this.owned(db,accountId,recommendationId);
   const account=(await db.query('SELECT status FROM creator_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0];if(account?.status!=='active')fail(404,'Account unavailable');
   await this.owned(db,accountId,recommendationId);
   const keyHash=hash(context.idempotencyKey),requestHash=hash(canonicalAppJson({recommendationId,...command}));
   const prior=(await db.query('SELECT request_hash,response,status,replay_until>clock_timestamp() replayable FROM application_command_receipts WHERE account_id=$1 AND operation=$2 AND idempotency_key_hash=$3 FOR UPDATE',[accountId,command.operation,keyHash])).rows[0];
   if(prior){if(!Buffer.isBuffer(prior.request_hash)||!prior.request_hash.equals(requestHash)||prior.status!=='completed'||!prior.replayable)fail(409,'Idempotency conflict');const original=(command.operation==='acceptAppEnrichment'?appAcceptanceResultSchema:appBindingResultSchema).parse(prior.response);await db.query('COMMIT');return original;}
   await lockContentCategories(db,accountId,['apps']);const recommendation=await this.owned(db,accountId,recommendationId,true);
   if(recommendation.archived_at)fail(404,'Recommendation unavailable');
   if(Number(recommendation.revision)!==command.expectedRecommendationRevision)fail(409,'Recommendation revision conflict');
   const bindingRow=(await db.query('SELECT * FROM app_enrichment_bindings WHERE recommendation_id=$1 AND account_id=$2 FOR UPDATE',[recommendationId,accountId])).rows[0];
   let binding:AppBinding|undefined=bindingRow?bindingDto(bindingRow):undefined;
   if((binding?.bindingRevision??null)!==command.expectedBindingRevision)fail(409,'Binding revision conflict');
   if(binding&&binding.appEntityId!==recommendation.entity_id)fail(409,'App identity conflict');
   const receiptId=randomUUID();let result:AppEnrichmentResult;
   if(command.operation==='acceptAppEnrichment'){
    if(!binding)fail(409,'Binding unavailable');
    // Resolve only owned scope first: historical owned entitlement is a stale-generation conflict, while a foreign guess remains unavailable.
    const entitlementRow=(await db.query('SELECT * FROM app_enrichment_entitlements WHERE snapshot_id=$1 AND recommendation_id=$2 AND account_id=$3 ORDER BY (generation_id=$4) DESC NULLS LAST,generation_id LIMIT 1',[command.snapshotId,recommendationId,accountId,binding.currentGenerationId])).rows[0];
    if(!entitlementRow)fail(404,'Owned snapshot unavailable');
    const generation=await this.generation(db,binding);
    if(entitlementRow.generation_id!==generation.value.generationId||entitlementRow.app_entity_id!==recommendation.entity_id)fail(409,'Generation conflict');
    const snapshotRow=(await db.query('SELECT payload FROM app_enrichment_snapshots WHERE id=$1',[command.snapshotId])).rows[0];if(!snapshotRow)fail(404,'Owned snapshot unavailable');
    const snapshot=ExplorersAppEnrichmentRepository.snapshotForStorage(snapshotRow.payload);
    const entitlement=appEntitlementSchema.parse({snapshotId:entitlementRow.snapshot_id,recommendationId:entitlementRow.recommendation_id,generationId:entitlementRow.generation_id,accountId:entitlementRow.account_id,appEntityId:entitlementRow.app_entity_id,observedBindingRevision:Number(entitlementRow.observed_binding_revision)});
    try{validateAppAcceptance({accountId,recommendationId,appEntityId:recommendation.entity_id,recommendationRevision:Number(recommendation.revision),binding,generation:generation.value,generationRetired:generation.retired,entitlement,snapshot},command);}catch(error){if(error instanceof AppAcceptanceValidationError)fail(error.code==='NOT_FOUND'?404:error.code==='CONFLICT'?409:422,'Acceptance unavailable');throw error;}
    const current=(await db.query('SELECT display_values FROM recommendation_display_overrides WHERE recommendation_id=$1 AND account_id=$2 FOR UPDATE',[recommendationId,accountId])).rows[0]?.display_values??{};
    const merge=mergeAppSnapshot(current,snapshot,command.selectedFields);
    if(merge.changed){await db.query('INSERT INTO recommendation_display_overrides(recommendation_id,account_id,display_values) VALUES($1,$2,$3::jsonb) ON CONFLICT(recommendation_id) DO UPDATE SET display_values=excluded.display_values',[recommendationId,accountId,JSON.stringify(merge.mergedValues)]);await db.query('UPDATE recommendations SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',[recommendationId]);}
    const record=appAcceptanceRecordSchema.parse({acceptanceId:randomUUID(),accountId,recommendationId,snapshotId:command.snapshotId,generationId:generation.value.generationId,selectedFields:merge.acceptedFields,acceptedValues:merge.acceptedValues,actorUserId:trustedActorUserId,receiptId,acceptedAt:new Date().toISOString()});
    await db.query('INSERT INTO app_enrichment_acceptances(id,account_id,recommendation_id,snapshot_id,generation_id,selected_fields,accepted_values,actor_user_id,receipt_id,accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)',[record.acceptanceId,accountId,recommendationId,record.snapshotId,record.generationId,record.selectedFields,JSON.stringify(record.acceptedValues),trustedActorUserId,receiptId,record.acceptedAt]);
    result=appAcceptanceResultSchema.parse({recommendationId,snapshotId:command.snapshotId,bindingGenerationId:generation.value.generationId,acceptedFields:merge.acceptedFields,changed:merge.changed,recommendationRevision:Number(recommendation.revision)+(merge.changed?1:0),categoryContentRevision:await this.categoryRevision(db,accountId),receiptId});
   }else{
    let changed=false;
    if(!binding){if(command.operation!=='configureAppEnrichment')fail(409,'Binding unavailable');binding={bindingId:randomUUID(),accountId,recommendationId,appEntityId:recommendation.entity_id,optIn:command.optIn,bindingRevision:1,currentGenerationId:null};await db.query('INSERT INTO app_enrichment_bindings(id,account_id,recommendation_id,app_entity_id,opt_in) VALUES($1,$2,$3,$4,$5)',[binding.bindingId,accountId,recommendationId,binding.appEntityId,binding.optIn]);binding.currentGenerationId=await this.insertGeneration(db,binding,command);await db.query('UPDATE app_enrichment_bindings SET current_generation_id=$2 WHERE id=$1',[binding.bindingId,binding.currentGenerationId]);changed=true;
    }else if(command.operation==='disableAppEnrichment'){
     if(binding.optIn){await db.query('UPDATE app_enrichment_bindings SET opt_in=false,binding_revision=binding_revision+1 WHERE id=$1',[binding.bindingId]);binding={...binding,optIn:false,bindingRevision:binding.bindingRevision+1};changed=true;}
    }else{
     const generation=await this.generation(db,binding);if(generation.retired)fail(409,'Generation unavailable');
     if(command.operation==='configureAppEnrichment'){
      if(!sameSource(generation.value,command))fail(422,'Explicit rebind required');
      if(binding.optIn!==command.optIn){await db.query('UPDATE app_enrichment_bindings SET opt_in=$2,binding_revision=binding_revision+1 WHERE id=$1',[binding.bindingId,command.optIn]);binding={...binding,optIn:command.optIn,bindingRevision:binding.bindingRevision+1};changed=true;}
     }else{
      await db.query('INSERT INTO app_enrichment_generation_retirements(generation_id) VALUES($1)',[generation.value.generationId]);
      const next=await this.insertGeneration(db,binding,command);await db.query('UPDATE app_enrichment_bindings SET current_generation_id=$2,opt_in=$3,binding_revision=binding_revision+1 WHERE id=$1',[binding.bindingId,next,command.optIn]);binding={...binding,currentGenerationId:next,optIn:command.optIn,bindingRevision:binding.bindingRevision+1};changed=true;
     }
    }
    result=appBindingResultSchema.parse({recommendationId,bindingId:binding.bindingId,bindingGenerationId:binding.currentGenerationId,optIn:binding.optIn,bindingRevision:binding.bindingRevision,recommendationRevision:Number(recommendation.revision),categoryContentRevision:await this.categoryRevision(db,accountId),changed,receiptId});
   }
   await db.query('INSERT INTO application_command_receipts(id,account_id,operation,idempotency_key_hash,request_hash,response) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[receiptId,accountId,command.operation,keyHash,requestHash,JSON.stringify(result)]);
   await db.query('COMMIT');return result;
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }
 /** Only current, owned entitlements are readable; globally guessed snapshot IDs convey no authority. */
 async readSuggestions(accountId:string,recommendationId:string):Promise<AppSnapshot[]>{
  contentIdSchema.parse(accountId);contentIdSchema.parse(recommendationId);
  const rows=await this.pool.query(`SELECT s.payload FROM app_enrichment_bindings b JOIN creator_accounts a ON a.id=b.account_id JOIN recommendations r ON r.id=b.recommendation_id AND r.account_id=b.account_id JOIN entities e ON e.id=r.entity_id JOIN app_enrichment_generations g ON g.id=b.current_generation_id AND g.binding_id=b.id AND g.app_entity_id=r.entity_id JOIN app_enrichment_entitlements t ON t.generation_id=g.id AND t.recommendation_id=r.id AND t.account_id=b.account_id JOIN app_enrichment_snapshots s ON s.id=t.snapshot_id WHERE b.account_id=$1 AND b.recommendation_id=$2 AND a.status='active' AND r.archived_at IS NULL AND r.category='apps' AND e.kind='app' AND e.origin='manual' AND NOT EXISTS(SELECT 1 FROM app_enrichment_generation_retirements x WHERE x.generation_id=g.id) ORDER BY s.fetched_at DESC,s.id`,[accountId,recommendationId]);
  return rows.rows.map(row=>ExplorersAppEnrichmentRepository.snapshotForStorage(row.payload));
 }
 async readBinding(accountId:string,recommendationId:string):Promise<AppBinding|null>{
  contentIdSchema.parse(accountId);contentIdSchema.parse(recommendationId);
  const row=(await this.pool.query(`SELECT b.* FROM app_enrichment_bindings b JOIN creator_accounts a ON a.id=b.account_id JOIN recommendations r ON r.id=b.recommendation_id AND r.account_id=b.account_id WHERE b.account_id=$1 AND b.recommendation_id=$2 AND a.status='active' AND r.archived_at IS NULL AND r.category='apps'`,[accountId,recommendationId])).rows[0];return row?bindingDto(row):null;
 }
}
