import type {Pool} from 'pg';
import {z} from 'zod/v3';
import {appSourceIdentitySchema,type AppSnapshot} from '../../shared/explorersAppEnrichmentContract';
import {contentIdSchema} from '../../shared/explorersContract';
import {ExplorersAppEnrichmentRepository} from './explorersAppEnrichmentRepository';

const fingerprint=z.string().regex(/^[a-f0-9]{64}$/);
const positive=z.number().int().positive().safe();
export const approvedWorkerSourceSchema=appSourceIdentitySchema.extend({approvalRevision:positive,configurationFingerprint:fingerprint}).strict();
export type ApprovedWorkerSource=z.infer<typeof approvedWorkerSourceSchema>;
const runDate=z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).refine(value=>{const date=new Date(`${value}T00:00:00.000Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value&&value.slice(0,4)!=='0000';});
export const appWorkerLeaseSchema=approvedWorkerSourceSchema.extend({jobId:contentIdSchema,token:contentIdSchema,holder:contentIdSchema,appEntityId:contentIdSchema,runDate,attempt:positive,leaseExpiresAt:z.string().datetime({offset:true})}).strict();
export type AppWorkerLease=z.infer<typeof appWorkerLeaseSchema>;
export type AppWorkerRun={runId:string;scheduleId:string;runDate:string};
export type AppWorkerReceipt=AppWorkerRun&{startedAt:string;endedAt:string;budgets:{runtimeMs:number;authorityCleanupMs:number};counts:{eligible:number;processed:number;unavailable:number;deferred:number;exhausted:number;cancelled:number;requests:number;bytes:number;costUnits:number;leaseLosses:number}};
export type AppWorkerOutcome={code:'unavailable'|'retry'|'invalid'|'cancelled';retryDelayMs?:number};
export type AppWorkerAuthorityPolicy={operationTimeoutMs:number;cleanupTimeoutMs:number};
export type AppWorkerEnrollResult={status:'enrolled'|'approval-conflict'|'disabled';eligible:number;reused:number};
export type AppWorkerClaimResult={status:'claimed';lease:AppWorkerLease}|{status:'idle'|'approval-conflict'};
export type AppWorkerCandidatesResult={status:'eligible';candidateIds:string[]}|{status:'lease-lost'|'cancelled'|'approval-conflict'};
export type AppWorkerCompleteResult={status:'succeeded'|'lease-lost'|'cancelled'|'approval-conflict';granted:number};
export type AppWorkerFinishResult={status:'finished';state:'unavailable'|'retry-wait'|'exhausted'|'cancelled'}|{status:'lease-lost'};
export interface AppWorkerRepository {
 forRun(signal:AbortSignal,policy:AppWorkerAuthorityPolicy):AppWorkerRepository;
 enqueueRun(run:AppWorkerRun,sources:readonly ApprovedWorkerSource[]):Promise<AppWorkerEnrollResult>;
 claimDue(input:ApprovedWorkerSource&{holder:string}):Promise<AppWorkerClaimResult>;
 eligibleCandidates(lease:AppWorkerLease):Promise<AppWorkerCandidatesResult>;
 renew(lease:AppWorkerLease):Promise<{status:'renewed'|'lease-lost'}>;
 commitSnapshot(lease:AppWorkerLease,candidateIds:readonly string[],snapshot:AppSnapshot):Promise<AppWorkerCompleteResult>;
 finishOutcome(lease:AppWorkerLease,outcome:AppWorkerOutcome):Promise<AppWorkerFinishResult>;
 recordRun(receipt:AppWorkerReceipt):Promise<{status:'recorded'}>;
}
const enrollment=z.object({status:z.enum(['enrolled','approval-conflict','disabled']),eligible:z.number().int().nonnegative().safe()}).strict();
const claim=z.union([z.object({status:z.literal('claimed'),lease:appWorkerLeaseSchema}).strict(),z.object({status:z.enum(['idle','approval-conflict'])}).strict()]);
const candidates=z.union([z.object({status:z.literal('eligible'),candidateIds:z.array(contentIdSchema)}).strict(),z.object({status:z.enum(['lease-lost','cancelled','approval-conflict'])}).strict()]);
const completed=z.object({status:z.enum(['succeeded','lease-lost','cancelled','approval-conflict']),granted:z.number().int().nonnegative().safe()}).strict();
const finish=z.union([z.object({status:z.literal('finished'),state:z.enum(['unavailable','retry-wait','exhausted','cancelled'])}).strict(),z.object({status:z.literal('lease-lost')}).strict()]);
const runSchema=z.object({runId:contentIdSchema,scheduleId:z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),runDate}).strict();
const countsSchema=z.object(Object.fromEntries(['eligible','processed','unavailable','deferred','exhausted','cancelled','requests','bytes','costUnits','leaseLosses'].map(k=>[k,z.number().int().nonnegative().safe()]))).strict();
const sourceArguments=(s:ApprovedWorkerSource)=>[s.sourceId,s.sourceIdentity,s.sourceIdentityHash,s.canonicalizationVersion,s.approvalRevision,s.configurationFingerprint];
const leaseArguments=(s:AppWorkerLease)=>[s.jobId,s.token,s.holder];

/** Every mutation and owner lock is a closed database entrypoint. The worker cannot
 * acquire a client and assemble its own transaction or directly insert metadata. */
export class ExplorersAppEnrichmentWorkerRepository implements AppWorkerRepository {
 constructor(private readonly pool:Pool,private readonly authority?:AppWorkerAuthorityPolicy,private readonly signal?:AbortSignal){}
 forRun(signal:AbortSignal,policy:AppWorkerAuthorityPolicy):AppWorkerRepository {
  const parsed=z.object({operationTimeoutMs:positive.max(2147483647),cleanupTimeoutMs:positive.max(2147483647)}).strict().parse(policy);
  return new ExplorersAppEnrichmentWorkerRepository(this.pool,parsed,signal);
 }
 private async query(sql:string,args:unknown[]):Promise<{rows:any[]}>{
  if(!this.authority)throw new Error('Worker authority timeout policy required');
  const poolOptions=(this.pool as Pool&{options?:{connectionTimeoutMillis?:number;query_timeout?:number}}).options,connectionTimeout=poolOptions?.connectionTimeoutMillis;
  if(!Number.isSafeInteger(connectionTimeout)||!connectionTimeout||connectionTimeout>Math.min(this.authority.operationTimeoutMs,this.authority.cleanupTimeoutMs)||poolOptions?.query_timeout)throw new Error('Worker pool requires bounded acquisition and server-owned query cancellation');
  if(this.signal?.aborted)throw new Error('Worker authority aborted');
  // Acquisition is bounded by the pool's explicit connectionTimeoutMillis. An
  // abort waits for that original acquisition to settle before releasing a client.
  const db=await this.pool.connect();let released=false,aborted=false;
  const destroy=()=>{aborted=true;if(!released){released=true;db.release(true);}};
  const check=()=>{if(aborted||this.signal?.aborted)throw new Error('Worker authority aborted');};
  const timer=setTimeout(destroy,this.authority.operationTimeoutMs);
  this.signal?.addEventListener('abort',destroy,{once:true});
  if(this.signal?.aborted)destroy();
  try{
   check();await db.query('BEGIN');check();
   await db.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)",[String(this.authority.operationTimeoutMs)]);check();
   const result=await db.query(sql,args);check();await db.query('COMMIT');return result;
  }catch(error){
   // Destroy during a running query rejects that SAME owned query promise. No
   // Promise.race abandons SQL; no COMMIT is sent after an abort. A disconnect
   // before COMMIT rolls back the server transaction. COMMIT-boundary uncertainty
   // is reported as failure, never fabricated success or a second completion.
   if(!released){try{await db.query('ROLLBACK');}catch{destroy();}}throw error;
  }finally{clearTimeout(timer);this.signal?.removeEventListener('abort',destroy);if(!released){released=true;db.release();}}
 }
 private async call(name:string,args:unknown[]):Promise<unknown>{
  const result=await this.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) AS result`,args);
  return result.rows[0]?.result;
 }
 async enqueueRun(input:AppWorkerRun,inputs:readonly ApprovedWorkerSource[]):Promise<AppWorkerEnrollResult>{
  const run=runSchema.parse(input),sources=inputs.map(value=>approvedWorkerSourceSchema.parse(value));
  const keys=sources.map(s=>JSON.stringify([s.sourceId,s.sourceIdentityHash,s.canonicalizationVersion]));
  if(new Set(keys).size!==keys.length)throw new Error('Ambiguous worker source');
  if(!sources.length)return {status:'disabled',eligible:0,reused:0};
  let eligible=0,reused=0,status:AppWorkerEnrollResult['status']='disabled';
  for(const source of sources.sort((a,b)=>JSON.stringify(sourceArguments(a)).localeCompare(JSON.stringify(sourceArguments(b))))){
   const result=enrollment.parse(await this.call('app_enrichment_worker_enroll_run',[run.runId,run.scheduleId,run.runDate,...sourceArguments(source)]));
   eligible+=result.eligible;if(result.status==='approval-conflict')status='approval-conflict';else if(result.status==='enrolled'&&status!=='approval-conflict')status='enrolled';
   if(result.status!=='enrolled')continue;
   // Each reuse call freezes and locks its own complete candidate prefix. No caller
   // transaction can append owners while holding a job lock.
   const successful=await this.query('SELECT id FROM public.app_enrichment_jobs WHERE source_id=$1 AND source_identity=$2 AND source_identity_hash=$3 AND canonicalization_version=$4 AND approval_revision=$5 AND configuration_fingerprint=$6 AND run_date=$7::date AND state=\'succeeded\' ORDER BY id',[...sourceArguments(source),run.runDate]);
   for(const row of successful.rows){const result=z.object({status:z.enum(['reused','unavailable','approval-conflict']),granted:z.number().int().nonnegative().safe()}).strict().parse(await this.call('app_enrichment_worker_reuse_success',[contentIdSchema.parse(row.id),source.configurationFingerprint]));reused+=result.granted;if(result.status==='approval-conflict')status='approval-conflict';}
  }
  return {status,eligible,reused};
 }
 async claimDue(input:ApprovedWorkerSource&{holder:string}):Promise<AppWorkerClaimResult>{
  const {holder,...rest}=input,source=approvedWorkerSourceSchema.parse(rest);
  return claim.parse(await this.call('app_enrichment_worker_claim',[contentIdSchema.parse(holder),...sourceArguments(source)]));
 }
 async eligibleCandidates(input:AppWorkerLease):Promise<AppWorkerCandidatesResult>{const lease=appWorkerLeaseSchema.parse(input);return candidates.parse(await this.call('app_enrichment_worker_check_fetch',[...leaseArguments(lease),lease.configurationFingerprint]));}
 async renew(input:AppWorkerLease):Promise<{status:'renewed'|'lease-lost'}>{const lease=appWorkerLeaseSchema.parse(input);return z.object({status:z.enum(['renewed','lease-lost'])}).strict().parse(await this.call('app_enrichment_worker_renew',leaseArguments(lease)));}
 async commitSnapshot(input:AppWorkerLease,ids:readonly string[],value:AppSnapshot):Promise<AppWorkerCompleteResult>{
  const lease=appWorkerLeaseSchema.parse(input),candidateIds=z.array(contentIdSchema).refine(v=>new Set(v).size===v.length).parse(ids),snapshot=ExplorersAppEnrichmentRepository.snapshotForStorage(value);
  if(snapshot.appEntityId!==lease.appEntityId||snapshot.sourceId!==lease.sourceId||snapshot.sourceIdentity!==lease.sourceIdentity||snapshot.sourceIdentityHash!==lease.sourceIdentityHash||snapshot.canonicalizationVersion!==lease.canonicalizationVersion)throw new Error('Worker snapshot source mismatch');
  return completed.parse(await this.call('app_enrichment_worker_complete',[...leaseArguments(lease),lease.configurationFingerprint,candidateIds,JSON.stringify(snapshot)]));
 }
 async finishOutcome(input:AppWorkerLease,value:AppWorkerOutcome):Promise<AppWorkerFinishResult>{
  const lease=appWorkerLeaseSchema.parse(input),outcome=z.object({code:z.enum(['unavailable','retry','invalid','cancelled']),retryDelayMs:positive.optional()}).strict().parse(value);
  if((outcome.code==='retry')!==(outcome.retryDelayMs!==undefined))throw new Error('Explicit retry delay required only for retry');
  return finish.parse(await this.call('app_enrichment_worker_finish_outcome',[...leaseArguments(lease),outcome.code,outcome.retryDelayMs??null]));
 }
 async recordRun(input:AppWorkerReceipt):Promise<{status:'recorded'}>{
  const {startedAt,endedAt,counts,budgets,...rest}=input,run=runSchema.parse(rest),start=z.string().datetime({offset:true}).parse(startedAt),end=z.string().datetime({offset:true}).parse(endedAt),safeCounts=countsSchema.parse(counts),safeBudgets=z.object({runtimeMs:positive.max(2147483647),authorityCleanupMs:positive.max(2147483647)}).strict().parse(budgets);
  if(Date.parse(end)<Date.parse(start))throw new Error('Invalid worker receipt interval');
  return z.object({status:z.literal('recorded')}).strict().parse(await this.call('app_enrichment_worker_record_run',[run.runId,run.scheduleId,run.runDate,start,end,JSON.stringify({counts:safeCounts,budgets:safeBudgets})]));
 }
}
