import type { AppSnapshotFields } from '../../shared/explorersAppEnrichmentContract';
import type { ApprovedAppWorkerSource } from './appEnrichmentWorkerValidation';
export type AppProviderParsingPolicy = Readonly<{
    maxInputBytes: number;
    maxHtmlNodes: number;
    maxHtmlDepth: number;
    maxJsonLdBlocks: number;
    maxJsonBytes: number;
    maxJsonDepth: number;
    maxJsonTokens: number;
}>;
export type AppDecodedOutcome = {
    kind: 'fields';
    fields: AppSnapshotFields;
} | {
    kind: 'unavailable';
};
export type AppleLookupIdentityInput = {
    trackId: string;
    storefront: string;
    kind: 'software' | 'mac-software';
};
export function validateProviderParsingPolicy(input: unknown): AppProviderParsingPolicy;
export function websiteProviderIdentity(canonicalUrl: string): ApprovedAppWorkerSource['identity'];
export function resolveWebsiteIdentity(identity: unknown): string;
export function appleProviderIdentity(input: unknown): ApprovedAppWorkerSource['identity'];
export function appleLookupUrl(input: unknown): string;
export function websiteAdapterVersion(policy: AppProviderParsingPolicy): string;
export function decodeProviderUtf8(bytes: Uint8Array, maxBytes: number): string;
export function parseBoundedProviderJson(text: string, policy: Pick<AppProviderParsingPolicy, 'maxJsonBytes' | 'maxJsonDepth' | 'maxJsonTokens'>): unknown;
/** Pure only: production execution requires owned cancellable isolation. */
export function decodeWebsiteMetadata(bytes: Uint8Array, identity: unknown, policy: AppProviderParsingPolicy, validateFields: (fields: unknown) => AppSnapshotFields): AppDecodedOutcome;
export function resolveAppleIdentity(identity:unknown):string;
export function appleAdapterVersion(policy:AppProviderParsingPolicy):string;
export function decodeAppleMetadata(bytes:Uint8Array,identity:unknown,policy:AppProviderParsingPolicy,validateFields:(fields:unknown)=>AppSnapshotFields):AppDecodedOutcome;
