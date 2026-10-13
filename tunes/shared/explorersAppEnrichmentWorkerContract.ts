import {z} from 'zod/v3';
import {appSourceIdentitySchema,appSelectedFieldsSchema} from './explorersAppEnrichmentContract';
function gregorian(value:string){
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 return year>=1&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}
export const appRunDateSchema=z.string().refine(gregorian,'Invalid Gregorian UTC date');
export type AppRunDate=z.infer<typeof appRunDateSchema>;
/** Freeze the trusted instant once per run; provider dates are never run authority. */
export function appRunDateFromInstant(instant:Date|string):AppRunDate {
 if(!(instant instanceof Date)&&typeof instant!=='string')throw new Error('Invalid trusted run instant');
 if(typeof instant==='string'&&(!z.string().datetime({offset:true}).safeParse(instant).success||!gregorian(instant.slice(0,10))))throw new Error('Invalid trusted run instant');
 const date=instant instanceof Date?new Date(instant.getTime()):new Date(instant);
 if(!Number.isFinite(date.getTime()))throw new Error('Invalid trusted run instant');
 return appRunDateSchema.parse(date.toISOString().slice(0,10));
}
const positive=z.number().int().positive().safe();
const duration=positive.max(2147483647);
export const appWorkerLimitsSchema=z.object({leaseDurationMs:duration,heartbeatIntervalMs:duration,maxAttempts:positive,retryMinDelayMs:duration,retryMaxDelayMs:duration,retryAfterMaxMs:duration,jobConcurrency:positive,maxJobsPerRun:positive,maxRequestsPerRun:positive,maxBytesPerRun:positive,maxRuntimeMs:duration,authorityTimeoutMs:duration,authorityCleanupTimeoutMs:duration,maxCostUnitsPerRun:positive,costUnitsPerRequest:positive,retentionDays:positive}).strict().superRefine((v,ctx)=>{
 if(v.authorityTimeoutMs>v.maxRuntimeMs||v.authorityTimeoutMs>v.authorityCleanupTimeoutMs||v.heartbeatIntervalMs>=v.leaseDurationMs||v.retryMinDelayMs>v.retryMaxDelayMs||v.retryAfterMaxMs<v.retryMinDelayMs||v.retryAfterMaxMs>v.retryMaxDelayMs||v.jobConcurrency>v.maxJobsPerRun||v.maxRequestsPerRun<v.jobConcurrency||v.costUnitsPerRequest>Math.floor(v.maxCostUnitsPerRun/v.jobConcurrency))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Inconsistent worker limits'});
});
export type WorkerLimits=Readonly<z.infer<typeof appWorkerLimitsSchema>>;
export const appWorkerIdentitySchema=appSourceIdentitySchema;
export const appWorkerAllowedFieldsSchema=appSelectedFieldsSchema.refine(v=>v.length>0,'At least one approved field required');
