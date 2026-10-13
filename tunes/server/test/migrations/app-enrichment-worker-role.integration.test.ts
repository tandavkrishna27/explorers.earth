import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import type {Pool} from 'pg';
import {verifyAppEnrichmentWorkerLogin,assertAppEnrichmentWorkerCapabilityMatrix,type AppWorkerRoleApproval} from '../../db/app-enrichment-worker-role';

describe('Apps A2 worker custody admission',()=>{
 it('invalid approval never obtains a pool connection',async()=>{
  const pool={connect:()=>{throw new Error('Unexpected resource admission');}} as unknown as Pool;
  await expect(verifyAppEnrichmentWorkerLogin(pool,{loginRole:'music_runtime',databaseName:'approved_test'})).rejects.toThrow('Invalid');
  await expect(verifyAppEnrichmentWorkerLogin(pool,{loginRole:'worker;drop',databaseName:'approved_test'})).rejects.toThrow('Invalid');
 });
 it('rejects a pool that selects the owner capability',async()=>{
  let released=false;const db={query:async()=>({rows:[{login:'approved_worker_login',capability:'app_enrichment_worker_owner',database:'approved_test'}]}),release:()=>{released=true;}};
  await expect(verifyAppEnrichmentWorkerLogin({connect:async()=>db} as unknown as Pool,{loginRole:'approved_worker_login',databaseName:'approved_test'})).rejects.toThrow('identity');expect(released).toBe(true);
 });
});

export type AppsA2RoleHarness={admin:Pool;worker:Pool;ownerRuntime:Pool;approval:AppWorkerRoleApproval;case:(id:string,work:()=>Promise<void>)=>Promise<void>};
async function denied(pool:Pool,sql:string,values:unknown[]=[]){let code:string|undefined;try{await pool.query(sql,values);}catch(error){code=(error as {code?:string}).code;}expect(code).toBe('42501');}
/** Root-owned canonical56 isolated real-login producer. No env/pool/provisioning,
 * never auto-runs on collection and never substitutes fake catalog evidence. */
export async function runAppsA2WorkerRoleAcceptance(h:AppsA2RoleHarness):Promise<void>{
 if(typeof h.case!=='function')throw new Error('Canonical56 worker role harness incomplete');
 await h.case('apps-a2-pg-worker-role',async()=>{
  await assertAppEnrichmentWorkerCapabilityMatrix(h.admin);
  await verifyAppEnrichmentWorkerLogin(h.worker,h.approval);
  expect((await h.worker.query('SELECT count(*) AS count FROM app_enrichment_jobs')).rows).toHaveLength(1);
  expect((await h.worker.query('SELECT app_enrichment_worker_renew($1,$2,$3) AS result',[randomUUID(),randomUUID(),randomUUID()])).rows[0].result).toEqual({status:'lease-lost'});
  for(const table of ['app_enrichment_job_candidates','app_enrichment_snapshots','app_enrichment_entitlements','app_enrichment_bindings','app_enrichment_generations','app_enrichment_generation_retirements','app_enrichment_acceptances','app_enrichment_source_approvals','app_enrichment_worker_runs'])await denied(h.worker,`INSERT INTO public.${table} DEFAULT VALUES`);
  await denied(h.worker,"UPDATE public.app_enrichment_jobs SET state='queued' WHERE false");
  for(const [table,column,value] of [['recommendations','revision','revision+1'],['recommendation_display_overrides','display_values',"'{}'::jsonb"],['collections','visibility',"'public'"],['entities','title',"'Changed'"],['creator_accounts','public_profile','true'],['taxonomy_terms','slug',"'changed'"],['music_schema_migrations','id',"'0000'"],['app_enrichment_source_approvals','enabled','true']])await denied(h.worker,`UPDATE public.${table} SET ${column}=${value} WHERE false`);
  await denied(h.worker,'DELETE FROM public.app_enrichment_snapshots WHERE false');
  await denied(h.worker,'TRUNCATE public.app_enrichment_entitlements');
  await denied(h.worker,'SELECT public.purge_explorers_account_content($1,$2)',[randomUUID(),randomUUID()]);
  await denied(h.worker,'SET ROLE app_enrichment_worker_owner');
  await denied(h.worker,'SET ROLE music_runtime');
  await denied(h.worker,'CREATE TABLE public.app_enrichment_worker_shadow_probe(id integer)');
  await denied(h.worker,'CREATE TEMP TABLE app_enrichment_worker_shadow_probe(id integer)');
  await denied(h.worker,"CREATE FUNCTION public.app_enrichment_worker_shadow_probe() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
  await denied(h.worker,'ALTER TABLE public.app_enrichment_snapshots DISABLE TRIGGER ALL');
  for(const table of ['app_enrichment_jobs','app_enrichment_job_candidates','app_enrichment_snapshots','app_enrichment_entitlements','app_enrichment_source_approvals','app_enrichment_worker_runs'])await denied(h.ownerRuntime,`INSERT INTO public.${table} DEFAULT VALUES`);
  await denied(h.ownerRuntime,'SELECT public.app_enrichment_worker_renew($1,$2,$3)',[randomUUID(),randomUUID(),randomUUID()]);
  await h.admin.query(`GRANT SELECT(id) ON public.creator_accounts TO ${h.approval.loginRole}`);
  try{await expect(verifyAppEnrichmentWorkerLogin(h.worker,h.approval)).rejects.toThrow('privilege matrix');}finally{await h.admin.query(`REVOKE SELECT(id) ON public.creator_accounts FROM ${h.approval.loginRole}`);}
  await verifyAppEnrichmentWorkerLogin(h.worker,h.approval);
 });
}
