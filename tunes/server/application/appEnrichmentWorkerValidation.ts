import {createHash} from 'node:crypto';
import {isIP} from 'node:net';
import {z} from 'zod/v3';
import {appWorkerIdentitySchema,appWorkerAllowedFieldsSchema,appWorkerLimitsSchema,type WorkerLimits} from '../../shared/explorersAppEnrichmentWorkerContract';
import type {AppSelectedField} from '../../shared/explorersAppEnrichmentContract';
import type {AppFetchConfig} from '../services/appEnrichmentFetch';
const label=z.string().min(1).max(2048);
const host=z.string().max(253).refine(h=>/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(h)&&isIP(h)===0);
const fetchSchema=z.object({contentProfile:z.enum(['html-utf8','json-utf8','apple-json-utf8']),allowedHosts:z.array(host).min(1).max(32).refine(v=>new Set(v).size===v.length),redirectPolicy:z.enum(['deny','same-host','allowed-hosts']),timeoutMs:z.number().int().min(1).max(60000),maxBytes:z.number().int().min(1).max(10485760),maxRedirects:z.number().int().min(0).max(10),maxRequests:z.number().int().min(1).max(11)}).strict();
const sourceSchema=z.object({identity:appWorkerIdentitySchema,approvalRevision:z.number().int().positive().safe(),adapterVersion:label,allowedFields:appWorkerAllowedFieldsSchema,canonicalUrlPolicyVersion:label,canonicalUrl:z.string().min(1).max(4096),fetch:fetchSchema,limits:appWorkerLimitsSchema}).strict().superRefine((v,ctx)=>{
 const n=v.limits.jobConcurrency;
 try {const url=new URL(v.canonicalUrl);if(url.href!==v.canonicalUrl||url.protocol!=='https:'||url.username||url.password||url.hash||url.port||/[\x00-\x20\x7f\\]/.test(v.canonicalUrl)||!v.fetch.allowedHosts.includes(url.hostname))throw new Error();}catch{ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid canonical URL policy'});}
 if(v.fetch.timeoutMs>v.limits.maxRuntimeMs||v.fetch.maxBytes>Math.floor(v.limits.maxBytesPerRun/n)||v.fetch.maxRequests>Math.floor(v.limits.maxRequestsPerRun/n)||v.fetch.maxRequests>Math.floor(v.limits.maxCostUnitsPerRun/v.limits.costUnitsPerRequest/n))ctx.addIssue({code:z.ZodIssueCode.custom,message:'Insufficient run reservations'});
});
export type ApprovedAppWorkerSource=Readonly<{identity:Readonly<z.infer<typeof appWorkerIdentitySchema>>;approvalRevision:number;adapterVersion:string;allowedFields:readonly AppSelectedField[];canonicalUrlPolicyVersion:string;canonicalUrl:string;fetch:Readonly<AppFetchConfig>;limits:WorkerLimits;configurationFingerprint:string}>;
export type AppWorkerConfiguration={kind:'disabled';sources:readonly ApprovedAppWorkerSource[]}|{kind:'configured';sources:readonly ApprovedAppWorkerSource[]};
/** Exact nonsecret data only. The separately approved resolver policy version is part of the fingerprint. */
function canonical(value:unknown):string {if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';return JSON.stringify(value);}
export function validateAppWorkerSources(input:unknown):AppWorkerConfiguration {
 if(input===null||input===undefined)return Object.freeze({kind:'disabled',sources:Object.freeze([])});
 try {
  const parsed=z.array(sourceSchema).parse(input),keys=new Set<string>();
  const sources=parsed.map(s=>{
   const key=canonical([s.identity.sourceId,s.identity.sourceIdentityHash,s.identity.canonicalizationVersion]);
   if(keys.has(key))throw new Error();keys.add(key);
   const nonsecret=s;
   const configurationFingerprint=createHash('sha256').update(canonical(nonsecret)).digest('hex');
   return Object.freeze({...s,identity:Object.freeze({...s.identity}),allowedFields:Object.freeze([...s.allowedFields]),fetch:Object.freeze({...s.fetch,allowedHosts:Object.freeze([...s.fetch.allowedHosts])}),limits:Object.freeze({...s.limits}),configurationFingerprint});
  });
  return Object.freeze({kind:sources.length?'configured':'disabled',sources:Object.freeze(sources)});
 }catch{throw new Error('Invalid App worker configuration');}
}
