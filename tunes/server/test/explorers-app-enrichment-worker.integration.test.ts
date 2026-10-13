import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {ExplorersAppEnrichmentWorkerRepository,type ApprovedWorkerSource,type AppWorkerLease} from '../repositories/explorersAppEnrichmentWorkerRepository';
import {ExplorersAppEnrichmentRepository} from '../repositories/explorersAppEnrichmentRepository';
import {hashAppSnapshot} from '../application/appEnrichmentValidation';

const source:ApprovedWorkerSource={sourceId:'synthetic-a2',sourceIdentity:'Exact/A2',sourceIdentityHash:'a'.repeat(64),canonicalizationVersion:'synthetic-v1',approvalRevision:1,configurationFingerprint:'b'.repeat(64)};
const run=()=>({runId:randomUUID(),scheduleId:'synthetic-test-only',runDate:new Date().toISOString().slice(0,10)});
const lease=():AppWorkerLease=>({...source,jobId:randomUUID(),token:randomUUID(),holder:randomUUID(),appEntityId:randomUUID(),runDate:'2026-10-13',attempt:1,leaseExpiresAt:'2026-10-13T12:00:00.000Z'});
const noResources={query:()=>{throw new Error('Unexpected resource admission');}} as unknown as Pool;
describe('Apps A2 portable durable repository admission',()=>{
 for(const method of ['renew','enroll'] as const)it(`aborts and settles a blocked ${method} without sending COMMIT`,async()=>{
  const controller=new AbortController(),statements:string[]=[];let rejectOwned:(e:Error)=>void=()=>{},releaseCount=0;let startedResolve:()=>void=()=>{};const started=new Promise<void>(resolve=>{startedResolve=resolve;});
  const db={query:async(sql:string)=>{statements.push(sql);if(sql.includes(`app_enrichment_worker_${method==='renew'?'renew':'enroll_run'}`)){startedResolve();return new Promise<never>((_,reject)=>{rejectOwned=reject;});}return {rows:[]};},release:(destroy:boolean)=>{expect(destroy).toBe(true);releaseCount++;rejectOwned(new Error('Owned connection terminated'));}};
  const pool={options:{connectionTimeoutMillis:100},connect:async()=>db} as unknown as Pool,repo=new ExplorersAppEnrichmentWorkerRepository(pool).forRun(controller.signal,{operationTimeoutMs:1000,cleanupTimeoutMs:1000});
  const operation=method==='renew'?repo.renew(lease()):repo.enqueueRun(run(),[source]);await started;controller.abort();await expect(operation).rejects.toThrow('Owned connection terminated');expect(releaseCount).toBe(1);expect(statements).not.toContain('COMMIT');
 });
 it('empty registry performs zero repository work',async()=>{expect(await new ExplorersAppEnrichmentWorkerRepository(noResources).enqueueRun(run(),[])).toEqual({status:'disabled',eligible:0,reused:0});});
 it('rejects normalized invalid run dates before admission',async()=>{for(const runDate of ['2026-02-29','2026-13-01','2026-10-13junk','0000-01-01'])await expect(new ExplorersAppEnrichmentWorkerRepository(noResources).enqueueRun({...run(),runDate},[source])).rejects.toThrow();});
 it('rejects ambiguous hash keys and caller capabilities before admission',async()=>{const repo=new ExplorersAppEnrichmentWorkerRepository(noResources);await expect(repo.enqueueRun(run(),[source,{...source,sourceIdentity:'other'}])).rejects.toThrow('Ambiguous');await expect(repo.claimDue({...source,holder:randomUUID(),approvalRevision:0})).rejects.toThrow();});
 it('invalid retry outcome never opens a transaction',async()=>{const repo=new ExplorersAppEnrichmentWorkerRepository(noResources);await expect(repo.finishOutcome(lease(),{code:'retry'})).rejects.toThrow('Explicit');await expect(repo.finishOutcome(lease(),{code:'unavailable',retryDelayMs:1})).rejects.toThrow('Explicit');});
 it('only executes guarded token-fenced calls and parses result authority',async()=>{const held=lease(),statements:Array<{sql:string;values:unknown[]}>=[];const db={query:async(sql:string,values:unknown[]=[])=>{if(sql.includes('app_enrichment_worker_renew')){statements.push({sql,values});return {rows:[{result:{status:'lease-lost'}}]};}return {rows:[]};},release:()=>{}};const pool={options:{connectionTimeoutMillis:1000},connect:async()=>db} as unknown as Pool;const repo=new ExplorersAppEnrichmentWorkerRepository(pool,{operationTimeoutMs:1000,cleanupTimeoutMs:1000});expect(await repo.renew(held)).toEqual({status:'lease-lost'});expect(statements).toEqual([{sql:'SELECT public.app_enrichment_worker_renew($1,$2,$3) AS result',values:[held.jobId,held.token,held.holder]}]);});
});

/** This acceptance producer does not create pools, inspect env, fetch, or run itself.
 * Root must supply migration56 isolated admin and separate worker login sessions,
 * exact fixtures, owned barrier control, real lifecycle operations and cleanup. */
export type AppsA2Fixture={accountId:string;recommendationId:string;entityId:string;bindingId:string;generationId:string;bindingRevision:number;collectionId:string};
export type AppsA2StorageHarness={
 admin:Pool;workerA:Pool;workerB:Pool;workerTimed:Pool;
 case:(id:string,work:()=>Promise<void>)=>Promise<void>;
 cleanup:()=>Promise<void>;
 seedEligible:(source:ApprovedWorkerSource,entityId?:string)=>Promise<AppsA2Fixture>;
 installApproval:(source:ApprovedWorkerSource,limits:{maxAttempts:number;leaseDurationMs:number})=>Promise<void>;
 setApproval:(source:ApprovedWorkerSource,enabled:boolean,revision:number)=>Promise<void>;
 expireLease:(jobId:string)=>Promise<void>;
 makeRetryDue:(jobId:string)=>Promise<void>;
 ownerDisable:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerReenable:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerUnpublishCollection:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerSuspend:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerRebind:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerReplaceEntity:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerArchiveRecommendation:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerArchiveCollection:(fixture:AppsA2Fixture)=>Promise<void>;
 addPrivateSibling:(fixture:AppsA2Fixture)=>Promise<void>;
 ownerPurge:(fixture:AppsA2Fixture)=>Promise<void>;
 preparePendingDeletion:(fixture:AppsA2Fixture)=>Promise<void>;
 runMaintenance:()=>Promise<void>;
 raceWithAccountFence:(fixture:AppsA2Fixture,first:()=>Promise<unknown>,later:Array<{pool:Pool;work:()=>Promise<unknown>}>)=>Promise<unknown[]>;
 injectDeferredSnapshotFailure:(work:()=>Promise<void>)=>Promise<void>;
 waitForWorkerBlocked:(pool:Pool)=>Promise<void>;
};
export const appsA2StorageCaseIds=Object.freeze([
 'apps-a2-pg-job-key-and-candidates','apps-a2-pg-single-lease-recovery',
 'apps-a2-pg-atomic-snapshot-entitlement','apps-a2-pg-eligibility-races',
 'apps-a2-pg-retry-budget','apps-a2-pg-purge-and-history',
 'apps-a2-pg-enrollment-completion-lock-order',
 'apps-a2-pg-authority-timeout-rollback',
 'apps-a2-pg-trusted-run-date-and-expiry',
 'apps-a2-pg-owner-writer-completion-races',
 'apps-a2-pg-terminal-purge-enroll-complete-race',
]);
const repo=(pool:Pool)=>new ExplorersAppEnrichmentWorkerRepository(pool,{operationTimeoutMs:30000,cleanupTimeoutMs:30000});
async function claim(pool:Pool){const result=await repo(pool).claimDue({...source,holder:randomUUID()});expect(result.status).toBe('claimed');if(result.status!=='claimed')throw new Error('No guarded lease');return result.lease;}
async function snapshotFor(held:AppWorkerLease){const fetchedAt='2026-10-13T00:00:00.000Z',fields={title:'Suggested app',description:null,platforms:['Web']};const identity={sourceId:held.sourceId,sourceIdentity:held.sourceIdentity,sourceIdentityHash:held.sourceIdentityHash,canonicalizationVersion:held.canonicalizationVersion};const raw={...identity,snapshotId:randomUUID(),appEntityId:held.appEntityId,adapterVersion:'synthetic-a2-v1',fetchedAt,contentHash:'0'.repeat(64),fields,fieldProvenance:Object.fromEntries(Object.keys(fields).map(key=>[key,{sourceUrl:'https://example.org/synthetic-a2',observedAt:fetchedAt}]))};return ExplorersAppEnrichmentRepository.snapshotForStorage({...raw,contentHash:hashAppSnapshot(raw)});}
async function candidates(pool:Pool,held:AppWorkerLease){const result=await repo(pool).eligibleCandidates(held);expect(result.status).toBe('eligible');if(result.status!=='eligible')throw new Error('No eligible candidates');return result.candidateIds;}
async function job(h:AppsA2StorageHarness,id:string){return (await h.admin.query('SELECT * FROM app_enrichment_jobs WHERE id=$1',[id])).rows[0];}
async function grants(h:AppsA2StorageHarness,id:string){return Number((await h.admin.query('SELECT count(*) AS count FROM app_enrichment_entitlements WHERE recommendation_id=$1',[id])).rows[0].count);}
async function prepare(h:AppsA2StorageHarness,maxAttempts=3){await h.installApproval(source,{maxAttempts,leaseDurationMs:60000});const f=await h.seedEligible(source);await repo(h.workerA).enqueueRun(run(),[source]);return f;}
export async function runAppsA2StorageAcceptance(h:AppsA2StorageHarness):Promise<void>{
 const callbacks=['case','cleanup','seedEligible','installApproval','setApproval','expireLease','makeRetryDue','ownerDisable','ownerReenable','ownerUnpublishCollection','ownerSuspend','ownerRebind','ownerReplaceEntity','ownerArchiveRecommendation','ownerArchiveCollection','addPrivateSibling','ownerPurge','preparePendingDeletion','runMaintenance','raceWithAccountFence','injectDeferredSnapshotFailure','waitForWorkerBlocked'] as const;
 for(const key of callbacks)if(typeof h[key]!=='function')throw new Error('Canonical56 Apps A2 harness incomplete');
 const cases:Array<{id:typeof appsA2StorageCaseIds[number];work:()=>Promise<void>}>=[
  {id:'apps-a2-pg-job-key-and-candidates',work:async()=>{
   const f=await prepare(h);await Promise.all([repo(h.workerA).enqueueRun(run(),[source]),repo(h.workerB).enqueueRun(run(),[source])]);
   const held=await claim(h.workerA);expect((await h.admin.query('SELECT count(*)::int AS count FROM app_enrichment_jobs WHERE app_entity_id=$1',[f.entityId])).rows[0].count).toBe(1);
   const ids=await candidates(h.workerA,held);expect(ids).toHaveLength(1);expect(await repo(h.workerA).commitSnapshot(held,ids,await snapshotFor(held))).toMatchObject({status:'succeeded',granted:1});
   const later=await h.seedEligible(source,f.entityId);expect(await repo(h.workerB).enqueueRun(run(),[source])).toMatchObject({status:'enrolled',reused:1});expect(await grants(h,later.recommendationId)).toBe(1);expect((await job(h,held.jobId)).attempt).toBe('1');
   expect(await repo(h.workerB).claimDue({...source,holder:randomUUID()})).toEqual({status:'idle'});
   expect(await repo(h.workerA).enqueueRun(run(),[{...source,sourceIdentity:'Collision/Unequal'}])).toMatchObject({status:'approval-conflict',eligible:0});
   const distinct={...source,sourceIdentity:'Exact/Distinct',sourceIdentityHash:'d'.repeat(64)};await h.installApproval(distinct,{maxAttempts:3,leaseDurationMs:60000});await h.seedEligible(distinct,f.entityId);expect(await repo(h.workerA).enqueueRun(run(),[distinct])).toMatchObject({status:'enrolled',eligible:1});const otherClaim=await repo(h.workerB).claimDue({...distinct,holder:randomUUID()});expect(otherClaim.status).toBe('claimed');expect((await h.admin.query('SELECT count(*)::int AS count FROM app_enrichment_jobs WHERE app_entity_id=$1',[f.entityId])).rows[0].count).toBe(2);
   await h.setApproval(source,true,2);const incompatible=await h.seedEligible({...source,approvalRevision:2},f.entityId);expect(await repo(h.workerA).enqueueRun(run(),[{...source,approvalRevision:2}])).toMatchObject({status:'approval-conflict'});expect(await grants(h,incompatible.recommendationId)).toBe(0);expect((await job(h,held.jobId)).state).toBe('succeeded');
  }},
  {id:'apps-a2-pg-single-lease-recovery',work:async()=>{
   await prepare(h,2);const claims=await Promise.all([repo(h.workerA).claimDue({...source,holder:randomUUID()}),repo(h.workerB).claimDue({...source,holder:randomUUID()})]);expect(claims.filter(x=>x.status==='claimed')).toHaveLength(1);
   const first=claims.find(x=>x.status==='claimed');if(first?.status!=='claimed')throw new Error('Claim winner missing');await h.expireLease(first.lease.jobId);const second=await claim(h.workerB);expect(second.token).not.toBe(first.lease.token);expect(second.attempt).toBe(2);
   expect(await repo(h.workerA).renew(first.lease)).toEqual({status:'lease-lost'});expect(await repo(h.workerA).commitSnapshot(first.lease,[],await snapshotFor(first.lease))).toEqual({status:'lease-lost',granted:0});
   await h.expireLease(second.jobId);expect(await repo(h.workerA).claimDue({...source,holder:randomUUID()})).toEqual({status:'idle'});expect(await job(h,second.jobId)).toMatchObject({state:'exhausted',lease_token:null,lease_holder:null,lease_expires_at:null});
  }},
  {id:'apps-a2-pg-atomic-snapshot-entitlement',work:async()=>{
   const f=await prepare(h),held=await claim(h.workerA),ids=await candidates(h.workerA,held),snapshot=await snapshotFor(held);const before=(await h.admin.query('SELECT revision FROM recommendations WHERE id=$1',[f.recommendationId])).rows[0].revision;
   await h.injectDeferredSnapshotFailure(async()=>{await expect(repo(h.workerA).commitSnapshot(held,ids,snapshot)).rejects.toThrow();});
   expect((await job(h,held.jobId)).state).toBe('leased');expect(await grants(h,f.recommendationId)).toBe(0);expect((await h.admin.query('SELECT id FROM app_enrichment_snapshots WHERE id=$1',[snapshot.snapshotId])).rows).toHaveLength(0);
   const changedPath={...snapshot,fieldProvenance:Object.fromEntries(Object.keys(snapshot.fields).map(key=>[key,{sourceUrl:'https://example.org/unapproved-path',observedAt:snapshot.fetchedAt}]))};changedPath.contentHash=hashAppSnapshot(changedPath);await expect(repo(h.workerA).commitSnapshot(held,ids,changedPath)).rejects.toMatchObject({code:'23514'});
   const empty={...snapshot,fields:{},fieldProvenance:{}};empty.contentHash=hashAppSnapshot(empty);await expect(h.workerA.query('SELECT app_enrichment_worker_complete($1,$2,$3,$4,$5,$6::jsonb)',[held.jobId,held.token,held.holder,held.configurationFingerprint,ids,JSON.stringify(empty)])).rejects.toMatchObject({code:'23514'});expect((await job(h,held.jobId)).state).toBe('leased');
   expect(await repo(h.workerA).commitSnapshot(held,ids,snapshot)).toMatchObject({status:'succeeded',granted:1});expect((await h.admin.query('SELECT revision FROM recommendations WHERE id=$1',[f.recommendationId])).rows[0].revision).toBe(before);
  }},
  {id:'apps-a2-pg-eligibility-races',work:async()=>{
   const f=await prepare(h),held=await claim(h.workerA),ids=await candidates(h.workerA,held);await h.ownerDisable(f);await h.ownerReenable(f);
   expect(await repo(h.workerA).commitSnapshot(held,ids,await snapshotFor(held))).toEqual({status:'cancelled',granted:0});expect(await grants(h,f.recommendationId)).toBe(0);
   // The same-day cancelled tuple does not revive. An independently eligible new
   // entity exercises actual collection publication fencing without faking dates.
   const next=await h.seedEligible(source);await repo(h.workerA).enqueueRun(run(),[source]);const second=await claim(h.workerA);await candidates(h.workerA,second);await h.ownerUnpublishCollection(next);expect(await repo(h.workerA).eligibleCandidates(second)).toEqual({status:'cancelled'});
   await repo(h.workerA).enqueueRun(run(),[source]);expect(await repo(h.workerA).claimDue({...source,holder:randomUUID()})).toEqual({status:'idle'});
   for(const mutate of [h.ownerRebind,h.ownerReplaceEntity,h.ownerSuspend,h.ownerArchiveRecommendation,h.ownerArchiveCollection]){const candidate=await h.seedEligible(source);await repo(h.workerA).enqueueRun(run(),[source]);const leased=await claim(h.workerA),frozen=await candidates(h.workerA,leased);await mutate(candidate);expect(await repo(h.workerA).commitSnapshot(leased,frozen,await snapshotFor(leased))).toEqual({status:'cancelled',granted:0});expect(await grants(h,candidate.recommendationId)).toBe(0);}
   const sibling=await h.seedEligible(source);await h.addPrivateSibling(sibling);await repo(h.workerA).enqueueRun(run(),[source]);const qualifying=await claim(h.workerA);expect(await repo(h.workerA).commitSnapshot(qualifying,await candidates(h.workerA,qualifying),await snapshotFor(qualifying))).toEqual({status:'succeeded',granted:1});
  }},
  {id:'apps-a2-pg-retry-budget',work:async()=>{
   await prepare(h,2);const held=await claim(h.workerA);expect(await repo(h.workerA).finishOutcome(held,{code:'retry',retryDelayMs:1000})).toEqual({status:'finished',state:'retry-wait'});
   expect(await repo(h.workerA).claimDue({...source,holder:randomUUID()})).toEqual({status:'idle'});await h.makeRetryDue(held.jobId);const second=await claim(h.workerB);expect(second.runDate).toBe(held.runDate);
   await h.setApproval(source,false,2);expect(await repo(h.workerB).renew(second)).toEqual({status:'lease-lost'});expect(await job(h,second.jobId)).toMatchObject({state:'cancelled',lease_token:null});
   await h.setApproval(source,true,3);expect(await repo(h.workerA).enqueueRun(run(),[{...source,approvalRevision:3}])).toMatchObject({status:'approval-conflict'});
   expect((await job(h,held.jobId)).state).toBe('cancelled');
  }},
  {id:'apps-a2-pg-purge-and-history',work:async()=>{
   const f=await prepare(h),other=await h.seedEligible(source,f.entityId);await repo(h.workerA).enqueueRun(run(),[source]);const held=await claim(h.workerA);expect(await repo(h.workerA).commitSnapshot(held,await candidates(h.workerA,held),await snapshotFor(held))).toMatchObject({status:'succeeded',granted:2});
   await h.ownerPurge(f);expect((await h.admin.query('SELECT id FROM app_enrichment_job_candidates WHERE account_id=$1',[f.accountId])).rows).toHaveLength(0);expect(await grants(h,other.recommendationId)).toBe(1);expect((await job(h,held.jobId)).state).toBe('succeeded');
   const columns=(await h.admin.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('app_enrichment_jobs','app_enrichment_worker_runs')")).rows.map(r=>r.column_name);expect(columns).not.toContain('account_id');expect(columns).not.toContain('recommendation_id');
  }},
  {id:'apps-a2-pg-enrollment-completion-lock-order',work:async()=>{
   const f=await prepare(h),held=await claim(h.workerA),ids=await candidates(h.workerA,held),later=await h.seedEligible(source,f.entityId);const blocker:PoolClient=await h.admin.connect();
   try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.accountId]);
    const completing=repo(h.workerA).commitSnapshot(held,ids,await snapshotFor(held));await h.waitForWorkerBlocked(h.workerA);
    // Completion is blocked in its owner prefix, not on the job. Concurrent enrollment
    // can take the other owner's locks without a completion->newowner cycle.
    const enrolling=repo(h.workerB).enqueueRun(run(),[source]);await h.waitForWorkerBlocked(h.workerB);
    await blocker.query('COMMIT');expect(await completing).toMatchObject({status:'succeeded',granted:1});
    expect(await enrolling).toMatchObject({reused:1});expect(await grants(h,later.recommendationId)).toBe(1);
   }finally{await blocker.query('ROLLBACK');blocker.release();}
  }},
  {id:'apps-a2-pg-trusted-run-date-and-expiry',work:async()=>{
   await h.installApproval(source,{maxAttempts:3,leaseDurationMs:60000});await h.seedEligible(source);
   for(const runDate of ['2026-02-29','1900-01-01','2999-12-31']){if(runDate==='2026-02-29')await expect(repo(h.workerA).enqueueRun({...run(),runDate},[source])).rejects.toThrow();else expect(await repo(h.workerA).enqueueRun({...run(),runDate},[source])).toMatchObject({status:'approval-conflict',eligible:0});}
   const expiredId=randomUUID(),day=(await h.admin.query("SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC')::date,'YYYY-MM-DD') AS day")).rows[0].day;
   // An expressly privileged isolated fixture builds persisted expired history;
   // the worker has no INSERT/UPDATE capability on this immutable authority.
   await h.admin.query("INSERT INTO app_enrichment_worker_run_authorities(id,schedule_id,run_date,started_at,expires_at,receipt_deadline_at) VALUES($1,'synthetic-test-only',$2::date,clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second',clock_timestamp()+interval '1 minute')",[expiredId,day]);
   expect(await repo(h.workerA).enqueueRun({runId:expiredId,scheduleId:'synthetic-test-only',runDate:day},[source])).toMatchObject({status:'approval-conflict',eligible:0});expect((await h.admin.query('SELECT id FROM app_enrichment_jobs')).rows).toHaveLength(0);
   const active=run();expect(await repo(h.workerA).enqueueRun(active,[source])).toMatchObject({status:'enrolled',eligible:1});expect(await repo(h.workerB).enqueueRun({...active,scheduleId:'different-schedule'},[source])).toMatchObject({status:'approval-conflict'});
   const frozenId=randomUUID(),previous=(await h.admin.query("SELECT to_char((clock_timestamp() AT TIME ZONE 'UTC')::date-1,'YYYY-MM-DD') AS day")).rows[0].day;
   // Test-only privileged persisted history represents a run established before
   // UTC midnight with a still-live window. No worker clock/date setter exists.
   await h.admin.query("INSERT INTO app_enrichment_worker_run_authorities(id,schedule_id,run_date,started_at,expires_at,receipt_deadline_at) VALUES($1,'synthetic-test-only',$2::date,clock_timestamp(),clock_timestamp()+interval '1 minute',clock_timestamp()+interval '2 minutes')",[frozenId,previous]);
   expect(await repo(h.workerA).enqueueRun({runId:frozenId,scheduleId:'synthetic-test-only',runDate:previous},[source])).toMatchObject({status:'enrolled',eligible:1});expect(await repo(h.workerB).enqueueRun({runId:frozenId,scheduleId:'synthetic-test-only',runDate:day},[source])).toMatchObject({status:'approval-conflict'});
  }},
  {id:'apps-a2-pg-authority-timeout-rollback',work:async()=>{
   const f=await prepare(h),held=await claim(h.workerA),blocker=await h.admin.connect(),bounded=new ExplorersAppEnrichmentWorkerRepository(h.workerTimed,{operationTimeoutMs:1000,cleanupTimeoutMs:1000});
   try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM app_enrichment_jobs WHERE id=$1 FOR UPDATE',[held.jobId]);const before=await job(h,held.jobId);const renewal=bounded.renew(held);await h.waitForWorkerBlocked(h.workerTimed);await expect(renewal).rejects.toThrow();expect(await job(h,held.jobId)).toEqual(before);await blocker.query('ROLLBACK');
    await blocker.query('BEGIN');await blocker.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.accountId]);const rowsBefore=(await h.admin.query('SELECT count(*) AS count FROM app_enrichment_jobs')).rows[0].count;const enrolling=bounded.enqueueRun(run(),[source]);await h.waitForWorkerBlocked(h.workerTimed);await expect(enrolling).rejects.toThrow();expect((await h.admin.query('SELECT count(*) AS count FROM app_enrichment_jobs')).rows[0].count).toBe(rowsBefore);
   }finally{await blocker.query('ROLLBACK');blocker.release();}
  }},
  {id:'apps-a2-pg-owner-writer-completion-races',work:async()=>{
   await h.installApproval(source,{maxAttempts:3,leaseDurationMs:60000});
   for(const mutation of [h.ownerDisable,h.ownerRebind,h.ownerReplaceEntity,h.ownerSuspend,h.ownerUnpublishCollection,h.ownerArchiveRecommendation,h.ownerArchiveCollection]){
    const f=await h.seedEligible(source),other=await h.seedEligible(source,f.entityId);await repo(h.workerA).enqueueRun(run(),[source]);const held=await claim(h.workerA),ids=await candidates(h.workerA,held),snapshot=await snapshotFor(held);
    const outcomes=await h.raceWithAccountFence(f,()=>mutation(f),[{pool:h.workerA,work:()=>repo(h.workerA).commitSnapshot(held,ids,snapshot)}]);
    expect(outcomes[1]).toEqual({status:'succeeded',granted:1});expect(await grants(h,f.recommendationId)).toBe(0);expect(await grants(h,other.recommendationId)).toBe(1);
   }
  }},
  {id:'apps-a2-pg-terminal-purge-enroll-complete-race',work:async()=>{
   const f=await prepare(h),other=await h.seedEligible(source,f.entityId);await repo(h.workerA).enqueueRun(run(),[source]);const held=await claim(h.workerA),ids=await candidates(h.workerA,held),snapshot=await snapshotFor(held);
   await h.preparePendingDeletion(f);
   const outcomes=await h.raceWithAccountFence(f,()=>h.runMaintenance(),[{pool:h.workerA,work:()=>repo(h.workerA).commitSnapshot(held,ids,snapshot)},{pool:h.workerB,work:()=>repo(h.workerB).enqueueRun(run(),[source])}]);
   // Maintenance uses SKIP LOCKED and may defer finalization while these actors
   // hold the account. Its actual follow-up pass runs after every actor settles.
   await h.runMaintenance();
   expect(outcomes[1]).toEqual({status:'succeeded',granted:1});expect((await h.admin.query('SELECT status FROM creator_accounts WHERE id=$1',[f.accountId])).rows[0].status).toBe('deleted');expect((await h.admin.query('SELECT id FROM app_enrichment_job_candidates WHERE account_id=$1',[f.accountId])).rows).toHaveLength(0);expect(await grants(h,f.recommendationId)).toBe(0);expect(await grants(h,other.recommendationId)).toBe(1);expect((await job(h,held.jobId)).state).toBe('succeeded');
  }},
 ];
 if(cases.length!==appsA2StorageCaseIds.length||new Set(cases.map(c=>c.id)).size!==cases.length||cases.some(c=>!appsA2StorageCaseIds.includes(c.id)))throw new Error('Apps A2 case inventory mismatch');
 for(const {id,work} of cases)await h.case(id,async()=>{let failure:unknown;try{await work();}catch(error){failure=error;}try{await h.cleanup();}catch(error){if(failure)throw new AggregateError([failure,error],'Apps qualification and owned cleanup failed');throw error;}if(failure)throw failure;});
}
