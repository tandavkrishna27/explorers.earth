import type {Pool} from 'pg';
import {z} from 'zod/v3';
const positive=z.number().int().positive().max(2147483647);
export const appRetentionPolicySchema=z.object({retentionDays:positive,maxJobs:positive,maxCandidates:positive,maxRuns:positive,maxAuthorities:positive,maxScanRows:positive,maxRunDates:positive,candidateChunkRows:positive,statementTimeoutMs:positive,lockTimeoutMs:positive,operationTimeoutMs:positive}).strict().superRefine((p,ctx)=>{
 if(p.lockTimeoutMs>p.statementTimeoutMs||p.statementTimeoutMs>p.operationTimeoutMs||p.candidateChunkRows>p.maxCandidates||[p.maxJobs,p.maxCandidates,p.maxRuns,p.maxAuthorities,p.maxRunDates].some(v=>v>p.maxScanRows))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid retention ceiling relationships'});
 if(!Number.isFinite(new Date(Date.now()+p.retentionDays*86400000).getTime()))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Unsupported retention interval'});
});
export type AppRetentionPolicy=z.infer<typeof appRetentionPolicySchema>;
export const appRetentionConfigurationSchema=z.object({expectedRevision:z.number().int().positive().safe(),ceilings:appRetentionPolicySchema}).strict();
export type AppRetentionConfiguration=z.infer<typeof appRetentionConfigurationSchema>;
const count=z.number().int().nonnegative().safe();
const resultSchema=z.object({status:z.enum(['disabled','completed','deferred']),deleted:z.object({jobs:count,candidates:count,runs:count,authorities:count}).strict()}).strict();
export type AppRetentionResult=z.infer<typeof resultSchema>;
/** No configuration means no authority and zero I/O. Configuration carries only
 * explicit nonsecret ceilings; the database independently checks persisted policy. */
export class ExplorersAppEnrichmentRetentionRepository {
 private readonly configuration:AppRetentionConfiguration|null;
 constructor(private readonly pool:Pool,configuration:AppRetentionConfiguration|null){this.configuration=configuration===null?null:appRetentionConfigurationSchema.parse(configuration);}
 async cleanup(signal:AbortSignal):Promise<AppRetentionResult>{
  if(this.configuration===null)return {status:'disabled',deleted:{jobs:0,candidates:0,runs:0,authorities:0}};
  if(signal.aborted)throw new Error('Retention authority aborted');
  const config=this.configuration,options=(this.pool as Pool&{options?:{connectionTimeoutMillis?:number;query_timeout?:number}}).options;
  if(!options?.connectionTimeoutMillis||!Number.isSafeInteger(options.connectionTimeoutMillis)||options.connectionTimeoutMillis>config.ceilings.operationTimeoutMs||options.query_timeout)throw new Error('Retention pool requires bounded owned acquisition');
  const db=await this.pool.connect();let released=false,aborted=false;
  const destroy=()=>{aborted=true;if(!released){released=true;db.release(true);}};
  const check=()=>{if(aborted||signal.aborted)throw new Error('Retention authority aborted');};
  const timer=setTimeout(destroy,config.ceilings.operationTimeoutMs);signal.addEventListener('abort',destroy,{once:true});if(signal.aborted)destroy();
  try{check();await db.query('BEGIN');check();await db.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true)",[String(config.ceilings.statementTimeoutMs),String(config.ceilings.lockTimeoutMs)]);check();
   const result=await db.query('SELECT public.app_enrichment_retention_cleanup($1,$2::jsonb) AS result',[config.expectedRevision,JSON.stringify(config.ceilings)]);check();const parsed=resultSchema.parse(result.rows[0]?.result);await db.query('COMMIT');return parsed;
  }catch(error){if(!released){try{await db.query('ROLLBACK');}catch{destroy();}}throw error;
  }finally{clearTimeout(timer);signal.removeEventListener('abort',destroy);if(!released){released=true;db.release();}}
 }
}
