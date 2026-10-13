import {types as utilTypes} from 'node:util';
import type {z} from 'zod/v3';
import {appSourceChoiceSchema,appSourceIdentitySchema,type AppSourceChoice} from '../../shared/explorersAppEnrichmentContract';
import {validateAppWorkerSources,type ApprovedAppWorkerSource} from './appEnrichmentWorkerValidation';
import {validateProviderParsingPolicy,type AppProviderParsingPolicy} from './appEnrichmentProviderCore.mjs';
import {createWebsiteMetadataAdapter} from './appEnrichmentWebsiteAdapter';
import {createAppleMetadataAdapter} from './appEnrichmentAppleAdapter';
import {validateAppDecoderIsolationPolicy,validateAppDecoderCustody,type AppDecoderIsolationPolicy,type AppDecoderCustody} from '../services/appEnrichmentOwnedDecoder';
import type {ReviewedAppWorkerAdapter} from './appEnrichmentWorker';
type AppSourceIdentity=z.infer<typeof appSourceIdentitySchema>;
export type AppProviderRegistry=Readonly<{workerSources:readonly ApprovedAppWorkerSource[];adapters:readonly ReviewedAppWorkerAdapter[];ownerSources:readonly AppSourceIdentity[];choices:readonly AppSourceChoice[]}>;
const refused=()=>new Error('Invalid App provider registry');
function objectData(input:unknown):Record<string,unknown>{if(!input||typeof input!=='object'||utilTypes.isProxy(input)||Object.getPrototypeOf(input)!==Object.prototype)throw refused();const captured:Record<string,unknown>={};for(const key of Reflect.ownKeys(input)){if(typeof key!=='string')throw refused();const d=Object.getOwnPropertyDescriptor(input,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))throw refused();Object.defineProperty(captured,key,{value:d.value,enumerable:true});}return captured;}
function arrayData(input:unknown):unknown[]{if(!Array.isArray(input)||utilTypes.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype)throw refused();const length=Object.getOwnPropertyDescriptor(input,'length')?.value;if(!Number.isSafeInteger(length)||Reflect.ownKeys(input).length!==length+1)throw refused();const result:unknown[]=[];for(let i=0;i<length;i++){const d=Object.getOwnPropertyDescriptor(input,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))throw refused();result.push(d.value);}return result;}
const identityKey=(i:AppSourceIdentity)=>JSON.stringify([i.sourceId,i.sourceIdentity,i.sourceIdentityHash,i.canonicalizationVersion]);
const empty=():AppProviderRegistry=>Object.freeze({workerSources:Object.freeze([]),adapters:Object.freeze([]),ownerSources:Object.freeze([]),choices:Object.freeze([])});
/** Curated composition only. No inference from app names, URLs, or request data. */
export function createAppProviderRegistry(input:unknown,policyInput:AppProviderParsingPolicy,isolationInput:AppDecoderIsolationPolicy,custody:AppDecoderCustody):AppProviderRegistry{
 if(input===null||input===undefined)return empty();
 try{
  const config=objectData(input);if(Object.keys(config).length!==2||!Object.hasOwn(config,'sources')||!Object.hasOwn(config,'choiceLabels'))throw refused();
  const sources=arrayData(config.sources).map(raw=>{const s=objectData(raw),fetch=objectData(s.fetch);return {...s,identity:objectData(s.identity),fetch:{...fetch,allowedHosts:arrayData(fetch.allowedHosts)},limits:objectData(s.limits),allowedFields:arrayData(s.allowedFields)};});
  const labels=arrayData(config.choiceLabels).map(raw=>{const label=objectData(raw);if(Object.keys(label).length!==2||!Object.hasOwn(label,'identity')||!Object.hasOwn(label,'label'))throw refused();return {...label,identity:appSourceIdentitySchema.parse(objectData(label.identity))};});
  const workerSources=validateAppWorkerSources(sources).sources;if(!workerSources.length){if(labels.length)throw refused();return empty();}
  const policy=validateProviderParsingPolicy(policyInput),isolation=validateAppDecoderIsolationPolicy(isolationInput),cap=validateAppDecoderCustody(custody,isolation);
  const concurrency=Math.min(...workerSources.map(source=>source.limits.jobConcurrency));if(concurrency>isolation.maxConcurrentDecoders||concurrency>cap)throw refused();
  const families=new Map<string,ReviewedAppWorkerAdapter>(),labelMap=new Map<string,AppSourceChoice>();
  for(const label of labels){const source=workerSources.find(s=>identityKey(s.identity)===identityKey(label.identity as AppSourceIdentity));if(!source)throw refused();const choice=appSourceChoiceSchema.parse({...label,sourceUrl:source.canonicalUrl}),key=identityKey(choice.identity);if(labelMap.has(key))throw refused();labelMap.set(key,Object.freeze({...choice,identity:source.identity}));}
  if(labelMap.size!==workerSources.length)throw refused();
  const choices:AppSourceChoice[]=[];
  for(const source of workerSources){
   const family=source.identity.sourceId;
   if(!['website-metadata','apple-app-store'].includes(family))throw refused();
   let adapter=families.get(family);if(!adapter){adapter=family==='website-metadata'?createWebsiteMetadataAdapter(policy,isolation,custody):createAppleMetadataAdapter(policy,isolation,custody);families.set(family,adapter);}
   const canonical=adapter.resolve(source),host=new URL(canonical).hostname,allowedFields=family==='website-metadata'?['title','description']:['title','description','priceTier','platforms'];
   if(source.fetch.maxBytes>policy.maxInputBytes||!source.fetch.allowedHosts.includes(host)||source.allowedFields.some(field=>!allowedFields.includes(field)))throw refused();
   if(family==='apple-app-store'&&(source.fetch.allowedHosts.length!==1||source.fetch.allowedHosts[0]!=='itunes.apple.com'))throw refused();
   choices.push(labelMap.get(identityKey(source.identity))!);
  }
  return Object.freeze({workerSources,adapters:Object.freeze([...families.values()]),ownerSources:Object.freeze(workerSources.map(source=>source.identity)),choices:Object.freeze(choices)});
 }catch{throw refused();}
}
