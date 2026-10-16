import {z} from 'zod/v3';
import {validateAppWorkerSources} from '../application/appEnrichmentWorkerValidation';
import {createAppProviderRegistry} from '../application/appEnrichmentProviderRegistry';
import {validateProviderParsingPolicy} from '../application/appEnrichmentProviderCore.mjs';
import {createAppDecoderCustody,validateAppDecoderIsolationPolicy} from '../services/appEnrichmentOwnedDecoder';
import type {AppSourceChoice} from '../../shared/explorersAppEnrichmentContract';
const envelope=z.object({configuration:z.unknown(),parsingPolicy:z.unknown(),isolationPolicy:z.unknown()}).strict();
/** Trusted operator configuration only; this does not schedule work or create a thread. */
export function resolveAppProviderOwnerChoices(environment:Record<string,string|undefined>):readonly AppSourceChoice[]{
 const raw=environment.EXPLORERS_APPS_PROVIDER_CONFIGURATION;
 if(raw===undefined)return Object.freeze([]);
 try{
  // Structural configuration admission, not a provider operating-policy default.
  if(typeof raw!=='string'||!raw.length||Buffer.byteLength(raw)>1048576)throw new Error();
  const data=envelope.parse(JSON.parse(raw)),configuration=z.object({sources:z.unknown(),choiceLabels:z.unknown()}).strict().parse(data.configuration);
  if(Object.keys(data).length!==3||Object.keys(configuration).length!==2||!Array.isArray(configuration.sources)||!Array.isArray(configuration.choiceLabels))throw new Error();
  const parsingPolicy=validateProviderParsingPolicy(data.parsingPolicy),isolationPolicy=validateAppDecoderIsolationPolicy(data.isolationPolicy),sources=validateAppWorkerSources(configuration.sources).sources;
  if(!sources.length){if(!Array.isArray(configuration.choiceLabels)||configuration.choiceLabels.length)throw new Error();return Object.freeze([]);}
  const concurrency=Math.min(...sources.map(source=>source.limits.jobConcurrency));
  const custody=createAppDecoderCustody(isolationPolicy,()=>{throw new Error('App provider owner configuration cannot execute decoders');},concurrency);
  return createAppProviderRegistry(configuration,parsingPolicy,isolationPolicy,custody).choices;
 }catch{throw new Error('Invalid App provider operator configuration');}
}
