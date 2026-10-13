import {randomUUID} from 'node:crypto';
import {z} from 'zod/v3';
import {appRunDateFromInstant} from '../../shared/explorersAppEnrichmentWorkerContract';
import {appSnapshotFieldsSchema,type AppSnapshot} from '../../shared/explorersAppEnrichmentContract';
import {contentIdSchema} from '../../shared/explorersContract';
import {validateAppWorkerSources,type ApprovedAppWorkerSource} from './appEnrichmentWorkerValidation';
import {hashAppSnapshot} from './appEnrichmentValidation';
import {ExplorersAppEnrichmentRepository} from '../repositories/explorersAppEnrichmentRepository';
import {appWorkerLeaseSchema,type AppWorkerRepository,type AppWorkerReceipt,type AppWorkerLease,type ApprovedWorkerSource} from '../repositories/explorersAppEnrichmentWorkerRepository';
import {createAppEnrichmentFetcher,parseAppRetryAfter,type AppFetchConfig,type AppFetchOutcome} from '../services/appEnrichmentFetch';
export type ReviewedAppWorkerAdapter={adapterVersion:string;canonicalUrlPolicyVersion:string;transientStatuses:readonly number[];resolve:(source:ApprovedAppWorkerSource)=>string;decode:(bytes:Buffer,identity:ApprovedAppWorkerSource['identity'],observedAt:string)=>unknown};
export type AppWorkerClock={now:()=>number;setTimeout:(callback:()=>void,ms:number)=>unknown;clearTimeout:(handle:unknown)=>void};
export type AppWorkerDependencies={repository:AppWorkerRepository;registry:readonly ReviewedAppWorkerAdapter[];clock?:AppWorkerClock;fetcher?:(config:AppFetchConfig)=>{fetch:(url:string,signal:AbortSignal)=>Promise<AppFetchOutcome>};uuid?:()=>string;retryDelay?:(attempt:number,source:ApprovedAppWorkerSource)=>number};
export type AppWorkerInput={sources:unknown;runId:string;scheduleId:string;holder:string;trustedInstant:Date|string;signal?:AbortSignal};
const nativeClock:AppWorkerClock={now:()=>Date.now(),setTimeout:(callback,ms)=>setTimeout(callback,ms),clearTimeout:handle=>clearTimeout(handle as ReturnType<typeof setTimeout>)};
const descriptor=(s:ApprovedAppWorkerSource):ApprovedWorkerSource=>({...s.identity,approvalRevision:s.approvalRevision,configurationFingerprint:s.configurationFingerprint});
const label=z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
const decodedSchema=z.object({fields:appSnapshotFieldsSchema}).strict();
/** Budgets count conservative per-fetch reservations, including every allowed hop.
 * Unfinished leases remain durable for database-clock expiry/recovery after a stop. */
export async function runAppEnrichmentWorker(input:AppWorkerInput,deps:AppWorkerDependencies):Promise<{kind:'disabled'}|{kind:'complete';receipt:AppWorkerReceipt}> {
 const config=validateAppWorkerSources(input.sources);if(config.kind==='disabled')return {kind:'disabled'};
 const sources=config.sources,runDate=appRunDateFromInstant(input.trustedInstant),runId=contentIdSchema.parse(input.runId),holder=contentIdSchema.parse(input.holder),scheduleId=label.parse(input.scheduleId);
 const registry=sources.map(source=>{
  const matches=deps.registry.filter(a=>a.adapterVersion===source.adapterVersion&&a.canonicalUrlPolicyVersion===source.canonicalUrlPolicyVersion);
  if(matches.length!==1||typeof matches[0].resolve!=='function'||typeof matches[0].decode!=='function'||!Array.isArray(matches[0].transientStatuses)||new Set(matches[0].transientStatuses).size!==matches[0].transientStatuses.length||matches[0].transientStatuses.some(s=>!Number.isInteger(s)||s!==429&&(s<500||s>599)))throw new Error('Invalid reviewed App worker registry');
  return Object.freeze({...matches[0],transientStatuses:Object.freeze([...matches[0].transientStatuses])});
 });
 const clock=deps.clock??nativeClock,now=()=>{const n=clock.now();if(!Number.isSafeInteger(n)||n<0)throw new Error('Invalid trusted worker clock');return n;},start=now();
 const limit=(key:'jobConcurrency'|'maxJobsPerRun'|'maxRequestsPerRun'|'maxBytesPerRun'|'maxRuntimeMs'|'authorityTimeoutMs'|'authorityCleanupTimeoutMs'|'maxCostUnitsPerRun')=>Math.min(...sources.map(s=>s.limits[key]));
 const budgets={jobs:limit('maxJobsPerRun'),requests:limit('maxRequestsPerRun'),bytes:limit('maxBytesPerRun'),cost:limit('maxCostUnitsPerRun'),runtime:limit('maxRuntimeMs')};
 const counts={eligible:0,processed:0,unavailable:0,deferred:0,exhausted:0,cancelled:0,requests:0,bytes:0,costUnits:0,leaseLosses:0};
 let abortAt:number|undefined;
 const runController=new AbortController(),abort=()=>{if(abortAt===undefined)abortAt=now();runController.abort();};input.signal?.addEventListener('abort',abort,{once:true});if(input.signal?.aborted)abort();
 const runTimer=clock.setTimeout(abort,budgets.runtime);let reservedJobs=0,nextSource=0;const idle=new Set<number>();
 const authorityPolicy={operationTimeoutMs:limit('authorityTimeoutMs'),cleanupTimeoutMs:limit('authorityCleanupTimeoutMs')};
 let repository:AppWorkerRepository;
 const process=async(source:ApprovedAppWorkerSource,adapter:ReviewedAppWorkerAdapter,lease:AppWorkerLease)=>{
  const eligible=await repository.eligibleCandidates(lease);
  if(eligible.status!=='eligible'){if(eligible.status==='lease-lost')counts.leaseLosses++;else counts.cancelled++;return;}
  if(runController.signal.aborted){counts.deferred++;return;}
  if(!eligible.candidateIds.length){const result=await repository.finishOutcome(lease,{code:'cancelled'});if(result.status==='lease-lost')counts.leaseLosses++;else counts.cancelled++;return;}
  const controller=new AbortController();let lost=false,heartbeat:unknown,pending:Promise<void>|undefined,stopped=false;
  const onAbort=()=>controller.abort();runController.signal.addEventListener('abort',onAbort,{once:true});if(runController.signal.aborted)onAbort();
  const renew=()=>{pending=(async()=>{try{const r=await repository.renew(lease);if(r.status!=='renewed'){lost=true;controller.abort();}}catch{lost=true;controller.abort();}finally{if(!stopped&&!lost)heartbeat=clock.setTimeout(renew,source.limits.heartbeatIntervalMs);}})();};
  heartbeat=clock.setTimeout(renew,source.limits.heartbeatIntervalMs);
  let outcome:AppFetchOutcome;
  try {
   const url=adapter.resolve(source);if(url!==source.canonicalUrl)throw new Error('Invalid reviewed destination');
   outcome=await (deps.fetcher??createAppEnrichmentFetcher)(source.fetch).fetch(url,controller.signal);
  }catch{outcome={kind:'rejected'};}
  finally{stopped=true;clock.clearTimeout(heartbeat);await pending;runController.signal.removeEventListener('abort',onAbort);}
  if(lost){counts.leaseLosses++;return;}if(runController.signal.aborted){counts.deferred++;return;}
  if(outcome.kind==='success'){
   let snapshot:AppSnapshot;
   try {
    const observedAt=new Date(now()).toISOString(),decoded=decodedSchema.parse(adapter.decode(Buffer.from(outcome.bytes),source.identity,observedAt));
    if(outcome.bytes.byteLength>source.fetch.maxBytes||!Object.keys(decoded.fields).length||Object.keys(decoded.fields).some(k=>!source.allowedFields.includes(k as typeof source.allowedFields[number])))throw new Error();
    const fieldProvenance=Object.fromEntries(Object.keys(decoded.fields).map(k=>[k,{sourceUrl:source.canonicalUrl,observedAt}]));
    const payload={...source.identity,snapshotId:contentIdSchema.parse((deps.uuid??randomUUID)()),appEntityId:lease.appEntityId,adapterVersion:source.adapterVersion,fetchedAt:observedAt,fields:decoded.fields,fieldProvenance,contentHash:'0'.repeat(64)};
    snapshot=ExplorersAppEnrichmentRepository.snapshotForStorage({...payload,contentHash:hashAppSnapshot(payload)});
   }catch{const result=await repository.finishOutcome(lease,{code:'invalid'});if(result.status==='lease-lost')counts.leaseLosses++;else {counts.processed++;if(result.state==='exhausted')counts.exhausted++;else if(result.state==='cancelled')counts.cancelled++;else if(result.state==='unavailable')counts.unavailable++;else counts.deferred++;}return;}
   const result=await repository.commitSnapshot(lease,eligible.candidateIds,snapshot);
   if(result.status==='lease-lost')counts.leaseLosses++;else if(result.status==='succeeded')counts.processed++;else counts.cancelled++;
   return;
  }
  const retry=outcome.kind==='timeout'||outcome.kind==='unavailable'||outcome.kind==='http-failure'&&(outcome.status===429||adapter.transientStatuses.includes(outcome.status));
  let delay:number|undefined;
  if(retry){const hint=outcome.kind==='http-failure'?parseAppRetryAfter(outcome.retryAfter,now(),{minMs:source.limits.retryMinDelayMs,maxMs:source.limits.retryAfterMaxMs}):null;const configured=hint??deps.retryDelay?.(lease.attempt,source)??source.limits.retryMinDelayMs;if(!Number.isSafeInteger(configured)||configured<source.limits.retryMinDelayMs||configured>source.limits.retryMaxDelayMs)throw new Error('Invalid explicit retry delay');delay=configured;}
  const result=await repository.finishOutcome(lease,retry?{code:'retry',retryDelayMs:delay}:{code:outcome.kind==='rejected'||outcome.kind==='budget-exceeded'?'invalid':outcome.kind==='aborted'?'cancelled':'unavailable'});
  if(result.status==='lease-lost')counts.leaseLosses++;else{counts.processed++;if(result.state==='exhausted')counts.exhausted++;else if(result.state==='cancelled')counts.cancelled++;else if(result.state==='unavailable')counts.unavailable++;else counts.deferred++;}
 };
 try {
  repository=deps.repository.forRun(runController.signal,authorityPolicy);
  const enrolled=new Set<number>();
  for(let index=0;index<sources.length&&!runController.signal.aborted;index++){const enrollment=await repository.enqueueRun({runId,scheduleId,runDate},[descriptor(sources[index])]);counts.eligible+=enrollment.eligible;if(enrollment.status==='enrolled')enrolled.add(index);else idle.add(index);}
  const worker=async()=>{
   while(enrolled.size>0&&!runController.signal.aborted&&now()-start<budgets.runtime&&idle.size<sources.length){
    const index=nextSource++%sources.length;if(idle.has(index))continue;const source=sources[index],requests=source.fetch.maxRequests,bytes=source.fetch.maxBytes,cost=requests*source.limits.costUnitsPerRequest;
    if(reservedJobs>=budgets.jobs||requests>budgets.requests-counts.requests||bytes>budgets.bytes-counts.bytes||cost>budgets.cost-counts.costUnits){counts.deferred++;return;}
    reservedJobs++;counts.requests+=requests;counts.bytes+=bytes;counts.costUnits+=cost;
    const claim=await repository.claimDue({...descriptor(source),holder});
    if(claim.status!=='claimed'){reservedJobs--;counts.requests-=requests;counts.bytes-=bytes;counts.costUnits-=cost;idle.add(index);continue;}
    const lease=appWorkerLeaseSchema.parse(claim.lease);
    if(lease.holder!==holder||Object.entries(descriptor(source)).some(([k,v])=>lease[k as keyof AppWorkerLease]!==v))throw new Error('Invalid worker lease authority');
    await process(source,registry[index],lease);
   }
  };
  // Wait for all launched work even if one throws; no unowned ongoing transport.
  const results=await Promise.allSettled(Array.from({length:limit('jobConcurrency')},worker));const failure=results.find(r=>r.status==='rejected');if(failure?.status==='rejected')throw new Error('App worker execution failed');
  const receipt={runId,scheduleId,runDate,startedAt:new Date(start).toISOString(),endedAt:new Date(now()).toISOString(),counts,budgets:{runtimeMs:budgets.runtime,authorityCleanupMs:authorityPolicy.cleanupTimeoutMs}};
  const remainingCleanupMs=authorityPolicy.cleanupTimeoutMs-(abortAt===undefined?0:Math.max(0,now()-abortAt));if(remainingCleanupMs<1)throw new Error('Owned cleanup deadline reached');
  const cleanupController=new AbortController(),cleanupTimer=clock.setTimeout(()=>cleanupController.abort(),remainingCleanupMs);
  try{const cleanupRepository=deps.repository.forRun(cleanupController.signal,{operationTimeoutMs:Math.min(authorityPolicy.operationTimeoutMs,remainingCleanupMs),cleanupTimeoutMs:remainingCleanupMs});await cleanupRepository.recordRun(receipt);}finally{clock.clearTimeout(cleanupTimer);cleanupController.abort();}return {kind:'complete',receipt};
 }catch{throw new Error('App worker execution failed');}finally{clock.clearTimeout(runTimer);input.signal?.removeEventListener('abort',abort);runController.abort();}
}
