import {describe,it,expect} from 'vitest';
import type {Pool} from 'pg';
import {appRetentionPolicySchema,ExplorersAppEnrichmentRetentionRepository} from '../../repositories/explorersAppEnrichmentRetentionRepository';
const policy={retentionDays:2,maxJobs:5,maxCandidates:10,maxRuns:5,maxAuthorities:5,maxScanRows:20,maxRunDates:5,candidateChunkRows:10,statementTimeoutMs:1000,lockTimeoutMs:500,operationTimeoutMs:1000};
describe('Apps A2 explicit retention authority',()=>{
 it('absent configuration disables cleanup before resource admission',async()=>{const pool={connect:()=>{throw new Error('Unexpected resource');}} as unknown as Pool;expect(await new ExplorersAppEnrichmentRetentionRepository(pool,null).cleanup(new AbortController().signal)).toEqual({status:'disabled',deleted:{jobs:0,candidates:0,runs:0,authorities:0}});});
 for(const key of Object.keys(policy))it(`requires explicit positive safe ${key}`,()=>{expect(()=>appRetentionPolicySchema.parse({...policy,[key]:undefined})).toThrow();expect(()=>appRetentionPolicySchema.parse({...policy,[key]:0})).toThrow();expect(()=>appRetentionPolicySchema.parse({...policy,[key]:Number.MAX_SAFE_INTEGER+1})).toThrow();});
 it('rejects surplus keys and inconsistent scan/chunk/time bounds',()=>{for(const value of [{...policy,extra:1},{...policy,maxJobs:21},{...policy,candidateChunkRows:11},{...policy,lockTimeoutMs:1001},{...policy,statementTimeoutMs:1001}])expect(()=>appRetentionPolicySchema.parse(value)).toThrow();});
 it('requires an approved revision before any SQL',async()=>{const pool={connect:()=>{throw new Error('Unexpected resource');}} as unknown as Pool;expect(()=>new ExplorersAppEnrichmentRetentionRepository(pool,{expectedRevision:0,ceilings:policy})).toThrow();});
 it('settles the original blocked operation on abort without COMMIT',async()=>{
  const controller=new AbortController(),statements:string[]=[];let rejectOwned:(e:Error)=>void=()=>{},released=0,startedResolve:()=>void=()=>{};const started=new Promise<void>(resolve=>{startedResolve=resolve;});
  const db={query:async(sql:string)=>{statements.push(sql);if(sql.includes('app_enrichment_retention_cleanup')){startedResolve();return new Promise<never>((_,reject)=>{rejectOwned=reject;});}return {rows:[]};},release:(destroy:boolean)=>{expect(destroy).toBe(true);released++;rejectOwned(new Error('Owned retention connection terminated'));}};
  const pool={options:{connectionTimeoutMillis:100},connect:async()=>db} as unknown as Pool,operation=new ExplorersAppEnrichmentRetentionRepository(pool,{expectedRevision:1,ceilings:policy}).cleanup(controller.signal);await started;controller.abort();await expect(operation).rejects.toThrow('Owned retention connection terminated');expect(released).toBe(1);expect(statements).not.toContain('COMMIT');
 });
 it('rolls back a malformed database result before COMMIT',async()=>{
  const statements:string[]=[];let released=0;const db={query:async(sql:string)=>{statements.push(sql);return {rows:sql.includes('app_enrichment_retention_cleanup')?[{result:{status:'completed',deleted:{jobs:0,candidates:0,runs:0,authorities:0},extra:'not authority'}}]:[]};},release:()=>{released++;}};
  const pool={options:{connectionTimeoutMillis:100},connect:async()=>db} as unknown as Pool;await expect(new ExplorersAppEnrichmentRetentionRepository(pool,{expectedRevision:1,ceilings:policy}).cleanup(new AbortController().signal)).rejects.toThrow();expect(statements).toContain('ROLLBACK');expect(statements).not.toContain('COMMIT');expect(released).toBe(1);
 });
});
