import { appSnapshotFieldsSchema } from '../../shared/explorersAppEnrichmentContract';
import {createHash} from 'node:crypto';
import { decodeWebsiteMetadata as decodeCore,validateProviderParsingPolicy,resolveWebsiteIdentity, type AppProviderParsingPolicy } from './appEnrichmentProviderCore.mjs';
import {createOwnedAppDecoder,validateAppDecoderIsolationPolicy,type AppDecoderIsolationPolicy,type AppDecoderCustody} from '../services/appEnrichmentOwnedDecoder';
import type {ReviewedAppWorkerAdapter} from './appEnrichmentWorker';
export {resolveWebsiteIdentity} from './appEnrichmentProviderCore.mjs';
/** Pure test/import entry only. Production adapter factory must use owned isolation. */
export function decodeWebsiteMetadata(bytes: Uint8Array, identity: unknown, policy: AppProviderParsingPolicy) {
    return decodeCore(bytes, identity, policy, fields => appSnapshotFieldsSchema.parse(fields));
}
/** Every parser and isolation cap is approval data, serialized in validated schema order. */
export function websiteAdapterVersion(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy):string{return 'website-metadata-v1:'+createHash('sha256').update(JSON.stringify({parsingPolicy:validateProviderParsingPolicy(policy),isolationPolicy:validateAppDecoderIsolationPolicy(isolation)})).digest('hex');}
export function createWebsiteMetadataAdapter(policy:AppProviderParsingPolicy,isolation:AppDecoderIsolationPolicy,custody:AppDecoderCustody):ReviewedAppWorkerAdapter{
 const adapterVersion=websiteAdapterVersion(policy,isolation),canonicalUrlPolicyVersion='website-url-v1',decode=createOwnedAppDecoder('website',policy,isolation,custody);
 return Object.freeze({adapterVersion,canonicalUrlPolicyVersion,transientStatuses:Object.freeze([429,...Array.from({length:100},(_,i)=>500+i)]),decode,resolve(source){const url=resolveWebsiteIdentity(source.identity);if(source.adapterVersion!==adapterVersion||source.canonicalUrlPolicyVersion!==canonicalUrlPolicyVersion||source.canonicalUrl!==url||source.fetch.contentProfile!=='html-utf8')throw new Error('Invalid reviewed App provider source');return url;}});
}
