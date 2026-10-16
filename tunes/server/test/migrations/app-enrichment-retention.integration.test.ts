import {expect} from 'vitest';
import type {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {ExplorersAppEnrichmentRetentionRepository,type AppRetentionPolicy} from '../../repositories/explorersAppEnrichmentRetentionRepository';
import {verifyAppEnrichmentRetentionLogin} from '../../db/app-enrichment-retention-role';
import {ExplorersAppEnrichmentWorkerRepository} from '../../repositories/explorersAppEnrichmentWorkerRepository';
import type {AppsA2StorageHarness,AppsA2Fixture} from '../explorers-app-enrichment-worker.integration.test';
export const appsA2RetentionTestPolicy:AppRetentionPolicy={retentionDays:1,maxJobs:2,maxCandidates:3,maxRuns:2,maxAuthorities:2,maxScanRows:20,maxRunDates:5,candidateChunkRows:2,statementTimeoutMs:2000,lockTimeoutMs:500,operationTimeoutMs:3000};
export type RetentionHistory={jobId:string;fixtures:AppsA2Fixture[];date:string;snapshotId:string|null};
export type AppsA2RetentionHarness={
 admin:Pool;retention:Pool;worker:Pool;runtime:Pool;storage:AppsA2StorageHarness;
 approval:{loginRole:string;databaseName:string};case:AppsA2StorageHarness['case'];
 prepare:()=>Promise<void>;cleanup:()=>Promise<void>;
 source:{sourceId:string;sourceIdentity:string;sourceIdentityHash:string;canonicalizationVersion:string;approvalRevision:number;configurationFingerprint:string};
 seedHistory:(options:{state:'cancelled'|'succeeded'|'queued'|'retry-wait'|'leased';ageDays:number;dateOffsetDays:number;candidates:number;accept?:boolean;jobId?:string})=>Promise<RetentionHistory>;
 seedRunHistory:(options:{old:boolean;receipt:boolean;liveReceiptWindow?:boolean})=>Promise<{id:string;day:string}>;
 seedIndexedHistory:(count:number)=>Promise<void>;
 provenance:()=>Promise<unknown>;
 injectDeferredCandidateFailure:(work:()=>Promise<void>)=>Promise<void>;
 waitForRetentionBlocked:()=>Promise<void>;
};
export const appsA2RetentionCaseIds=Object.freeze([
 'apps-a2-pg-retention-bounded-history','apps-a2-pg-retention-live-and-due-protection',
 'apps-a2-pg-retention-authority-expiry-fence','apps-a2-pg-retention-atomic-timeout',
 'apps-a2-pg-retention-role','apps-a2-pg-retention-indexed-windows-and-provenance',
 'apps-a2-pg-retention-late-success-reuse-race','apps-a2-pg-retention-terminal-purge-race',
]);
const clean=(h:AppsA2RetentionHarness,p=appsA2RetentionTestPolicy)=>new ExplorersAppEnrichmentRetentionRepository(h.retention,{expectedRevision:1,ceilings:p}).cleanup(new AbortController().signal);
const rows=(h:AppsA2RetentionHarness,table:string,id:string)=>h.admin.query(`SELECT * FROM public.${table} WHERE id=$1`,[id]);
async function denied(pool:Pool,sql:string,args:unknown[]=[]){await expect(pool.query(sql,args)).rejects.toMatchObject({code:'42501'});}
export async function runAppsA2RetentionAcceptance(h:AppsA2RetentionHarness):Promise<void>{
 const cases:Array<{id:typeof appsA2RetentionCaseIds[number];work:()=>Promise<void>}>= [
  {id:'apps-a2-pg-retention-bounded-history',work:async()=>{
   await h.prepare();const history=await h.seedHistory({state:'succeeded',ageDays:4,dateOffsetDays:4,candidates:7,accept:true}),receipt=await h.seedRunHistory({old:true,receipt:true});const before=await h.provenance();
   let total=0;for(let i=0;i<4;i++){const result=await clean(h);expect(result.deleted.candidates).toBeLessThanOrEqual(2);expect(result.deleted.jobs).toBeLessThanOrEqual(2);expect(result.deleted.runs).toBeLessThanOrEqual(2);expect(result.deleted.authorities).toBeLessThanOrEqual(2);total+=result.deleted.candidates;}
   expect(total).toBe(7);expect((await rows(h,'app_enrichment_jobs',history.jobId)).rows).toHaveLength(0);expect((await rows(h,'app_enrichment_worker_runs',receipt.id)).rows).toHaveLength(0);expect((await rows(h,'app_enrichment_worker_run_authorities',receipt.id)).rows).toHaveLength(0);expect(await h.provenance()).toEqual(before);
   const adversarial=[];for(const [ageDays,jobId] of [[6,'ffffffff-ffff-4fff-8fff-fffffffffff3'],[5,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'],[4,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1']] as const)adversarial.push(await h.seedHistory({state:'cancelled',ageDays,dateOffsetDays:ageDays,candidates:1,jobId}));
   for(let i=0;i<3;i++){const result=await clean(h);expect(result.deleted.jobs).toBeLessThanOrEqual(2);expect(result.deleted.candidates).toBeLessThanOrEqual(2);}for(const item of adversarial)expect((await rows(h,'app_enrichment_jobs',item.jobId)).rows).toHaveLength(0);
  }},
  {id:'apps-a2-pg-retention-live-and-due-protection',work:async()=>{
   await h.prepare();const protectedIds:string[]=[];for(const state of ['queued','retry-wait','leased'] as const)protectedIds.push((await h.seedHistory({state,ageDays:20,dateOffsetDays:20,candidates:1})).jobId);
   const today=await h.seedHistory({state:'cancelled',ageDays:20,dateOffsetDays:0,candidates:1});protectedIds.push(today.jobId);
   const currentWindow=await h.seedRunHistory({old:false,receipt:false,liveReceiptWindow:true});const before=await h.admin.query('SELECT * FROM app_enrichment_jobs ORDER BY id');expect((await clean(h)).deleted).toEqual({jobs:0,candidates:0,runs:0,authorities:0});expect((await h.admin.query('SELECT * FROM app_enrichment_jobs ORDER BY id')).rows).toEqual(before.rows);expect((await rows(h,'app_enrichment_worker_run_authorities',currentWindow.id)).rows).toHaveLength(1);
   // A long-pending job gets fresh terminal age through the ACTUAL worker transition.
   const claim=await new ExplorersAppEnrichmentWorkerRepository(h.worker,{operationTimeoutMs:30000,cleanupTimeoutMs:30000}).claimDue({...h.source,holder:randomUUID()});expect(claim.status).toBe('claimed');if(claim.status!=='claimed')throw new Error('Pending lease missing');
   const repo=new ExplorersAppEnrichmentWorkerRepository(h.worker,{operationTimeoutMs:30000,cleanupTimeoutMs:30000});await repo.finishOutcome(claim.lease,{code:'unavailable'});const terminal=(await rows(h,'app_enrichment_jobs',claim.lease.jobId)).rows[0];expect(Date.now()-new Date(terminal.terminalized_at).getTime()).toBeLessThan(30000);expect(new Date(terminal.terminal_retained_until).getTime()-new Date(terminal.terminalized_at).getTime()).toBe(86400000);await clean(h);expect((await rows(h,'app_enrichment_jobs',claim.lease.jobId)).rows).toHaveLength(1);
  }},
  {id:'apps-a2-pg-retention-authority-expiry-fence',work:async()=>{
   await h.prepare();const history=await h.seedHistory({state:'cancelled',ageDays:4,dateOffsetDays:4,candidates:1}),authority=randomUUID(),f=history.fixtures[0],blocker=await h.admin.connect();
   await h.admin.query("INSERT INTO app_enrichment_worker_run_authorities(id,schedule_id,run_date,started_at,expires_at,receipt_deadline_at) VALUES($1,'synthetic-test-only',$2::date,clock_timestamp(),clock_timestamp()+interval '1 second',clock_timestamp()+interval '1 minute')",[authority,history.date]);
   let pending:Promise<unknown>|undefined;try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM creator_accounts WHERE id=$1 FOR UPDATE',[f.accountId]);pending=new ExplorersAppEnrichmentWorkerRepository(h.worker,{operationTimeoutMs:30000,cleanupTimeoutMs:30000}).enqueueRun({runId:authority,scheduleId:'synthetic-test-only',runDate:history.date},[h.source]);pending.catch(()=>{});await h.storage.waitForWorkerBlocked(h.worker);
    const deadline=Date.now()+5000;while(Date.now()<deadline){if((await h.admin.query('SELECT clock_timestamp()>expires_at AS expired FROM app_enrichment_worker_run_authorities WHERE id=$1',[authority])).rows[0].expired)break;await new Promise(resolve=>setTimeout(resolve,10));}
    const result=await clean(h);expect(result.status).toBe('deferred');expect(result.deleted.jobs).toBe(0);await blocker.query('COMMIT');expect(await pending).toMatchObject({status:'approval-conflict'});await clean(h);expect((await rows(h,'app_enrichment_jobs',history.jobId)).rows).toHaveLength(0);expect((await h.admin.query('SELECT id FROM app_enrichment_jobs WHERE app_entity_id=$1 AND run_date=$2::date',[f.entityId,history.date])).rows).toHaveLength(0);expect((await rows(h,'app_enrichment_worker_run_authorities',authority)).rows).toHaveLength(1);
   }finally{await blocker.query('ROLLBACK');if(pending)await Promise.allSettled([pending]);blocker.release();}
  }},
  {id:'apps-a2-pg-retention-atomic-timeout',work:async()=>{
   await h.prepare();const old=await h.seedHistory({state:'cancelled',ageDays:4,dateOffsetDays:4,candidates:3}),before=(await h.admin.query('SELECT * FROM app_enrichment_job_candidates WHERE job_id=$1 ORDER BY id',[old.jobId])).rows;
   await h.injectDeferredCandidateFailure(async()=>{await expect(clean(h)).rejects.toMatchObject({code:'23514'});});expect((await h.admin.query('SELECT * FROM app_enrichment_job_candidates WHERE job_id=$1 ORDER BY id',[old.jobId])).rows).toEqual(before);
   const blocker=await h.admin.connect();let pending:Promise<unknown>|undefined;try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM app_enrichment_job_candidates WHERE job_id=$1 ORDER BY id FOR UPDATE',[old.jobId]);pending=clean(h);pending.catch(()=>{});await h.waitForRetentionBlocked();await expect(pending).rejects.toThrow();expect((await h.admin.query('SELECT * FROM app_enrichment_job_candidates WHERE job_id=$1 ORDER BY id',[old.jobId])).rows).toEqual(before);}finally{await blocker.query('ROLLBACK');if(pending)await Promise.allSettled([pending]);blocker.release();}
  }},
  {id:'apps-a2-pg-retention-role',work:async()=>{
   await h.prepare();await verifyAppEnrichmentRetentionLogin(h.retention,h.approval);expect((await clean(h)).status).toBe('completed');
   await denied(h.worker,'SELECT app_enrichment_retention_cleanup($1,$2::jsonb)',[1,JSON.stringify(appsA2RetentionTestPolicy)]);await denied(h.runtime,'SELECT app_enrichment_retention_cleanup($1,$2::jsonb)',[1,JSON.stringify(appsA2RetentionTestPolicy)]);
   for(const table of ['app_enrichment_jobs','app_enrichment_job_candidates','app_enrichment_worker_runs','app_enrichment_worker_run_authorities','app_enrichment_snapshots','app_enrichment_entitlements','app_enrichment_acceptances']){await denied(h.retention,`DELETE FROM public.${table} WHERE false`);await denied(h.retention,`SELECT * FROM public.${table}`);}
   await denied(h.retention,'UPDATE app_enrichment_retention_policy SET enabled=false WHERE false');await denied(h.retention,'UPDATE recommendations SET revision=revision+1 WHERE false');await denied(h.retention,'SET ROLE app_enrichment_retention_owner');await denied(h.retention,'SET ROLE app_enrichment_worker');await denied(h.retention,'CREATE TEMP TABLE apps_retention_shadow(id integer)');await denied(h.retention,'CREATE TABLE public.apps_retention_shadow(id integer)');
   const old=await h.seedHistory({state:'cancelled',ageDays:4,dateOffsetDays:4,candidates:1}),connection=await h.retention.connect();
   try{
    for(const timeout of ['0','5000']){await connection.query('BEGIN');await connection.query("SELECT set_config('statement_timeout',$1,true)",[timeout]);await expect(connection.query('SELECT public.app_enrichment_retention_cleanup($1,$2::jsonb) AS result',[1,JSON.stringify(appsA2RetentionTestPolicy)])).rejects.toMatchObject({code:'23514'});await connection.query('ROLLBACK');expect((await rows(h,'app_enrichment_jobs',old.jobId)).rows).toHaveLength(1);}
    await connection.query('BEGIN');await connection.query("SELECT set_config('statement_timeout','0',true)");await expect(connection.query("SELECT set_config('statement_timeout','500',true),public.app_enrichment_retention_cleanup($1,$2::jsonb)",[1,JSON.stringify(appsA2RetentionTestPolicy)])).rejects.toMatchObject({code:'23514'});await connection.query('ROLLBACK');
    await connection.query('BEGIN');await connection.query("SELECT set_config('statement_timeout','500',true)");await expect(connection.query('SELECT public.app_enrichment_retention_cleanup($1,$2::jsonb) FROM generate_series(1,1)',[1,JSON.stringify(appsA2RetentionTestPolicy)])).rejects.toMatchObject({code:'23514'});await connection.query('ROLLBACK');
    await connection.query('BEGIN');await connection.query("SELECT set_config('statement_timeout','500',true)");await expect(connection.query(`DO $$ BEGIN PERFORM public.app_enrichment_retention_cleanup(1,'${JSON.stringify(appsA2RetentionTestPolicy)}'::jsonb);END $$`)).rejects.toMatchObject({code:'23514'});await connection.query('ROLLBACK');
    expect((await rows(h,'app_enrichment_jobs',old.jobId)).rows).toHaveLength(1);await connection.query('BEGIN');await connection.query("SELECT set_config('statement_timeout','2000',true)");expect((await connection.query('SELECT public.app_enrichment_retention_cleanup($1,$2::jsonb) AS result',[1,JSON.stringify(appsA2RetentionTestPolicy)])).rows[0].result.deleted.jobs).toBe(1);await connection.query('COMMIT');
   }finally{await connection.query('ROLLBACK');connection.release();}
  }},
  {id:'apps-a2-pg-retention-indexed-windows-and-provenance',work:async()=>{
   await h.prepare();await h.seedHistory({state:'succeeded',ageDays:4,dateOffsetDays:4,candidates:1,accept:true});await h.seedIndexedHistory(200);const before=await h.provenance();const policy={...appsA2RetentionTestPolicy,maxScanRows:3,maxRunDates:3};const result=await clean(h,policy);expect(result.deleted.candidates).toBeLessThanOrEqual(2);expect(result.deleted.jobs).toBeLessThanOrEqual(2);expect(await h.provenance()).toEqual(before);
   const indexes=(await h.admin.query("SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])",[['app_enrichment_jobs_retention_idx','app_enrichment_job_candidates_retention_idx','app_enrichment_worker_authority_date_idx','app_enrichment_worker_authority_retention_idx','app_enrichment_worker_run_retention_idx']])).rows;expect(indexes).toHaveLength(5);
   await h.admin.query('ANALYZE app_enrichment_jobs');const plan=(await h.admin.query("EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM app_enrichment_jobs WHERE state IN('succeeded','unavailable','exhausted','cancelled') AND terminal_retained_until<=$1::timestamptz ORDER BY terminal_retained_until,id LIMIT 3",[new Date().toISOString()])).rows[0]['QUERY PLAN'];expect(plan[0].Plan['Node Type']).toBe('Limit');expect(plan[0].Plan['Actual Rows']).toBeLessThanOrEqual(3);expect(JSON.stringify(plan)).toContain('app_enrichment_jobs_retention_idx');
  }},
  {id:'apps-a2-pg-retention-late-success-reuse-race',work:async()=>{
   await h.prepare();const old=await h.seedHistory({state:'succeeded',ageDays:4,dateOffsetDays:4,candidates:2,accept:true}),later=old.fixtures[1];
   // Privileged isolated history fixture: this late eligible candidate was enrolled
   // before the completed snapshot's frozen set, so it is not yet entitled.
   await h.admin.query('DELETE FROM app_enrichment_entitlements WHERE snapshot_id=$1 AND recommendation_id=$2 AND generation_id=$3',[old.snapshotId,later.recommendationId,later.generationId]);
   const blocker=await h.admin.connect(),worker=await h.worker.connect();let pending:Promise<any>|undefined;
   try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM app_enrichment_generations WHERE id=$1 FOR UPDATE',[later.generationId]);await worker.query('BEGIN');await worker.query("SELECT set_config('statement_timeout','30000',true)");pending=worker.query('SELECT public.app_enrichment_worker_reuse_success($1,$2) AS result',[old.jobId,h.source.configurationFingerprint]);pending.catch(()=>{});await h.storage.waitForWorkerBlocked(h.worker);
    const result=await clean(h);expect(result.status).toBe('deferred');expect(result.deleted.jobs).toBe(0);expect(result.deleted.candidates).toBe(0);await blocker.query('COMMIT');expect((await pending).rows[0].result).toEqual({status:'reused',granted:1});await worker.query('COMMIT');const retained=await h.provenance();await clean(h);expect((await rows(h,'app_enrichment_jobs',old.jobId)).rows).toHaveLength(0);expect(await h.provenance()).toEqual(retained);
   }finally{await blocker.query('ROLLBACK');if(pending)await Promise.allSettled([pending]);await worker.query('ROLLBACK');blocker.release();worker.release();}
  }},
  {id:'apps-a2-pg-retention-terminal-purge-race',work:async()=>{
   await h.prepare();const old=await h.seedHistory({state:'succeeded',ageDays:4,dateOffsetDays:4,candidates:2,accept:true}),deleting=old.fixtures[0],other=old.fixtures[1];await h.storage.preparePendingDeletion(deleting);
   const operation=(await h.admin.query("SELECT id FROM account_lifecycle_operations WHERE account_id=$1 AND kind='delete' AND state='running'",[deleting.accountId])).rows[0].id,blocker=await h.admin.connect(),runtime=await h.runtime.connect();let pending:Promise<any>|undefined;
   const otherBefore=(await h.admin.query('SELECT * FROM app_enrichment_entitlements WHERE recommendation_id=$1',[other.recommendationId])).rows,snapshotBefore=(await rows(h,'app_enrichment_snapshots',old.snapshotId!)).rows;
   try{await blocker.query('BEGIN');await blocker.query('SELECT id FROM app_enrichment_job_candidates WHERE job_id=$1 AND account_id=$2 FOR UPDATE',[old.jobId,deleting.accountId]);await runtime.query('BEGIN');await runtime.query("SELECT set_config('statement_timeout','30000',true)");pending=runtime.query('SELECT public.purge_explorers_account_content($1,$2)',[deleting.accountId,operation]);pending.catch(()=>{});await h.storage.waitForWorkerBlocked(h.runtime);
    // The actual purge holds its owner prefix and waits on its candidate. Cleanup
    // takes no owner lock; its bounded child-row wait fails and rolls back.
    const cleaning=clean(h);cleaning.catch(()=>{});await h.waitForRetentionBlocked();await expect(cleaning).rejects.toThrow();expect((await rows(h,'app_enrichment_jobs',old.jobId)).rows).toHaveLength(1);
    await blocker.query('COMMIT');await pending;await runtime.query('COMMIT');await h.storage.runMaintenance();await clean(h);expect((await h.admin.query('SELECT id FROM app_enrichment_job_candidates WHERE account_id=$1',[deleting.accountId])).rows).toHaveLength(0);expect((await h.admin.query('SELECT * FROM app_enrichment_entitlements WHERE recommendation_id=$1',[other.recommendationId])).rows).toEqual(otherBefore);expect((await rows(h,'app_enrichment_snapshots',old.snapshotId!)).rows).toEqual(snapshotBefore);
   }finally{await blocker.query('ROLLBACK');if(pending)await Promise.allSettled([pending]);await runtime.query('ROLLBACK');blocker.release();runtime.release();}
  }},
 ];
 if(cases.length!==appsA2RetentionCaseIds.length||new Set(cases.map(c=>c.id)).size!==cases.length)throw new Error('Retention case inventory mismatch');
 for(const {id,work} of cases)await h.case(id,async()=>{let failure:unknown;try{await work();}catch(error){failure=error;}try{await h.cleanup();}catch(error){if(failure)throw new AggregateError([failure,error],'Retention and owned cleanup failed');throw error;}if(failure)throw failure;});
}
