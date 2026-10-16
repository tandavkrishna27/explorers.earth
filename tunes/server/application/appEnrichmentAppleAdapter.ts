import { appSnapshotFieldsSchema } from '../../shared/explorersAppEnrichmentContract';
import {createHash} from 'node:crypto';
import { decodeAppleMetadata as decodeCore,validateProviderParsingPolicy,resolveAppleIdentity, type AppProviderParsingPolicy } from './appEnrichmentProviderCore.mjs';
import {createOwnedAppDecoder,validateAppDecoderIsolationPolicy,type AppDecoderIsolationPolicy,type AppDecoderCustody} from '../services/appEnrichmentOwnedDecoder';
import type {ReviewedAppWorkerAdapter} from './appEnrichmentWorker';
export {resolveAppleIdentity} from './appEnrichmentProviderCore.mjs';
/** Pure test/import entry only. Production adapter factory must use owned isolation. */
export function decodeAppleMetadata(bytes: Uint8Array, identity: unknown, policy: AppProviderParsingPolicy) {
    return decodeCore(bytes, identity, policy, fields => appSnapshotFieldsSchema.parse(fields));
}
export function appleAdapterVersion(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy):string{return 'apple-metadata-v1:'+createHash('sha256').update(JSON.stringify({parsingPolicy:validateProviderParsingPolicy(policy),isolationPolicy:validateAppDecoderIsolationPolicy(isolation)})).digest('hex');}
export function createAppleMetadataAdapter(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):ReviewedAppWorkerAdapter{
 const adapterVersion=appleAdapterVersion(policy,isolation),canonicalUrlPolicyVersion='apple-lookup-v1',decode=createOwnedAppDecoder('apple',policy,isolation,custody);
 return Object.freeze({adapterVersion,canonicalUrlPolicyVersion,transientStatuses:Object.freeze([429,...Array.from({length:100},(_,i)=>500+i)]),decode,resolve(source){const url=resolveAppleIdentity(source.identity);if(source.adapterVersion!==adapterVersion||source.canonicalUrlPolicyVersion!==canonicalUrlPolicyVersion||source.canonicalUrl!==url||source.fetch.contentProfile!=='apple-json-utf8')throw new Error('Invalid reviewed App provider source');return url;}});
}
