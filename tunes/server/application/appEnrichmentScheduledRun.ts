import {randomUUID} from 'node:crypto';
import {types as utilTypes} from 'node:util';
import {z} from 'zod/v3';
import {createAppProviderRegistry} from './appEnrichmentProviderRegistry';
import {validateProviderParsingPolicy,type AppProviderParsingPolicy} from './appEnrichmentProviderCore.mjs';
import {validateAppDecoderIsolationPolicy,createAppDecoderCustody,type AppDecoderIsolationPolicy} from '../services/appEnrichmentOwnedDecoder';
import {runAppEnrichmentWorker,type AppWorkerDependencies} from './appEnrichmentWorker';
import {appRunDateFromInstant} from '../../shared/explorersAppEnrichmentWorkerContract';
import {appRetentionConfigurationSchema,type AppRetentionConfiguration,type AppRetentionResult,type ExplorersAppEnrichmentRetentionRepository} from '../repositories/explorersAppEnrichmentRetentionRepository';
import type {AppWorkerRepository,AppWorkerReceipt} from '../repositories/explorersAppEnrichmentWorkerRepository';
export type AppScheduledConfiguration=Readonly<{scheduleId:string;providers:unknown;parsing:AppProviderParsingPolicy;isolation:AppDecoderIsolationPolicy;retention:AppRetentionConfiguration|null}>;
export type AppScheduledDependencies=Readonly<{repository:AppWorkerRepository;readDatabaseInstant:(signal:AbortSignal)=>Promise<string>;retentionFactory:(configuration:AppRetentionConfiguration)=>Pick<ExplorersAppEnrichmentRetentionRepository,'cleanup'>;fatalSupervisor:(code:'decoder-unsettled')=>never;fetcher?:AppWorkerDependencies['fetcher']} >;
export type AppScheduledOutcome={kind:'disabled'}|{kind:'complete';receipt:AppWorkerReceipt;retention:AppRetentionResult}|{kind:'interrupted';drained:true;workerReceipt?:AppWorkerReceipt};
const failed=()=>new Error('App scheduled invocation failed');
const fatalFailures=new WeakSet<object>();
const fatalFailure=()=>{const error=failed();fatalFailures.add(error);return error;};
export function isAppScheduledFatalFailure(error:unknown):boolean{return typeof error==='object'&&error!==null&&fatalFailures.has(error);}
function own(input:unknown):Record<string,unknown>{if(!input||typeof input!=='object'||utilTypes.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)throw Error();const copy:Record<string,unknown>={};for(const key of Reflect.ownKeys(input)){if(typeof key!=='string')throw Error();const d=Object.getOwnPropertyDescriptor(input,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw Error();Object.defineProperty(copy,key,{value:d.value,enumerable:true});}return copy;}
const disabledRetention:AppRetentionResult=Object.freeze({status:'disabled',deleted:Object.freeze({jobs:0,candidates:0,runs:0,authorities:0})});
/** Validates without resources. Every invocation owns a new controller and shared decoder custody. */
export function createAppScheduledRun(input:AppScheduledConfiguration|null,deps:AppScheduledDependencies):(signal:AbortSignal)=>Promise<AppScheduledOutcome>{
 if(input===null)return async()=>({kind:'disabled'});
 let config:AppScheduledConfiguration,rawSources:readonly unknown[],choiceLabels:readonly unknown[];
 try{
  const data=own(input);if(Object.keys(data).length!==5||Object.keys(data).some(key=>!['scheduleId','providers','parsing','isolation','retention'].includes(key)))throw Error();
  const scheduleId=z.string().regex(/^[A-Za-z0-9._-]{1,100}$/).parse(data.scheduleId);
  if(data.providers===null||data.providers===undefined)return async()=>({kind:'disabled'});
  const parsing=validateProviderParsingPolicy(data.parsing),isolation=validateAppDecoderIsolationPolicy(data.isolation);
  const preview=createAppProviderRegistry(data.providers,parsing,isolation,createAppDecoderCustody(isolation,()=>{throw failed();},isolation.maxConcurrentDecoders));
  if(!preview.workerSources.length)return async()=>({kind:'disabled'});
  // Strip only our just-derived field, never admit a fingerprint supplied in raw config.
  rawSources=Object.freeze(preview.workerSources.map(({configurationFingerprint:_derived,...raw})=>Object.freeze(raw)));
  choiceLabels=Object.freeze(preview.choices.map(choice=>Object.freeze({identity:choice.identity,label:choice.label})));
  const retention=data.retention===null?null:appRetentionConfigurationSchema.parse({...own(data.retention),ceilings:own(own(data.retention).ceilings)});
  if(retention){Object.freeze(retention.ceilings);Object.freeze(retention);}
  config=Object.freeze({scheduleId,providers:Object.freeze({sources:rawSources,choiceLabels}),parsing,isolation,retention});
  if(typeof deps.readDatabaseInstant!=='function'||typeof deps.fatalSupervisor!=='function'||typeof deps.retentionFactory!=='function'||!deps.repository)throw Error();
 }catch{throw new Error('Invalid App schedule configuration');}
 let fatalClosed=false;
 return async(signal:AbortSignal):Promise<AppScheduledOutcome>=>{
  if(fatalClosed)throw fatalFailure();
  if(!(signal instanceof AbortSignal))throw failed();if(signal.aborted)return {kind:'interrupted',drained:true};
  const controller=new AbortController(),abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});let fatalSeen=false,workerReceipt:AppWorkerReceipt|undefined;
  try{
   const concurrency=Math.min(...(rawSources as Array<{limits:{jobConcurrency:number}}>).map(source=>source.limits.jobConcurrency));
   const custody=createAppDecoderCustody(config.isolation,code=>{fatalSeen=true;fatalClosed=true;controller.abort();return deps.fatalSupervisor(code);},concurrency);
   const registry=createAppProviderRegistry(config.providers,config.parsing,config.isolation,custody);
   const instant=z.string().datetime({offset:true}).parse(await deps.readDatabaseInstant(controller.signal));
   if(controller.signal.aborted)return {kind:'interrupted',drained:true};
   const runDate=appRunDateFromInstant(instant),result=await runAppEnrichmentWorker({sources:rawSources,runId:randomUUID(),scheduleId:config.scheduleId,holder:randomUUID(),trustedInstant:instant,signal:controller.signal},{repository:deps.repository,registry:registry.adapters,...(deps.fetcher?{fetcher:deps.fetcher}:{})});
   if(result.kind==='disabled')throw failed();workerReceipt=result.receipt;if(workerReceipt.runDate!==runDate)throw failed();
   if(fatalSeen)throw failed();if(controller.signal.aborted)return {kind:'interrupted',drained:true,workerReceipt};
   const retention=config.retention?await deps.retentionFactory(config.retention).cleanup(controller.signal):disabledRetention;
   if(controller.signal.aborted)return {kind:'interrupted',drained:true,workerReceipt};
   return {kind:'complete',receipt:workerReceipt,retention};
  }catch{if(fatalSeen)throw fatalFailure();if(controller.signal.aborted)return {kind:'interrupted',drained:true,...(workerReceipt?{workerReceipt}:{})};throw failed();}
  finally{signal.removeEventListener('abort',abort);controller.abort();}
 };
}
