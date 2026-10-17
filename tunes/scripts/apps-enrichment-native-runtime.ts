import { types as utilTypes } from 'node:util';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { inspectAppsEnrichmentProvisionGrant } from './apps-browser-fixture';
import { createAppsEnrichmentWorkerTrigger, type AppsEnrichmentWorkerAdmission, type AppsEnrichmentRegistryBinding } from './apps-enrichment-browser-support';
import { runAppEnrichmentWorker, type ReviewedAppWorkerAdapter } from '../server/application/appEnrichmentWorker';
import { ExplorersAppEnrichmentWorkerRepository } from '../server/repositories/explorersAppEnrichmentWorkerRepository';
import {validateAppWorkerSources,type ApprovedAppWorkerSource} from '../server/application/appEnrichmentWorkerValidation';
import type { createAppsEnrichmentQualificationLedger } from '../server/services/appEnrichmentQualificationLedger';
/** Interface only: the fixture's private WeakMap is the sole issuer. */
export type AppsEnrichmentProvisionState = {
    abort: () => void;
    query: (text: string, values?: unknown[]) => Promise<{
        rows: any[];
    }>;
    signal: AbortSignal;
    pending: Set<Promise<unknown>>;
    registry: AppsEnrichmentRegistryBinding;
    adapters: readonly ReviewedAppWorkerAdapter[];
    ledger: ReturnType<typeof createAppsEnrichmentQualificationLedger>;
    workerPool: Pool;
    runId: string;
    assertCurrent: () => void;
    verifyAck: (admission: AppsEnrichmentWorkerAdmission, signal: AbortSignal) => Promise<boolean>;
    trustedInstant: () => Promise<Date>;
    close: () => Promise<void>;
};
const refused = () => Error('Apps enrichment native custody refused');
export type AppsEnrichmentRefreshStage='worker-admission'|'verify-ack'|'provider-execute'|'result-verify'|'snapshot-read';
/** The private registry derives this field; the production worker accepts raw inputs. */
function rawSourceForOwnedWorker(source:ApprovedAppWorkerSource){
 const {configurationFingerprint,...raw}=source,checked=validateAppWorkerSources([raw]);
 if(checked.kind!=='configured'||checked.sources.length!==1||checked.sources[0].configurationFingerprint!==configurationFingerprint)throw refused();
 return Object.freeze(raw);
}
/** No pool, request, decoder or environment lookup is created by this constructor. */
export function createAppsEnrichmentNativeRuntime(input: Readonly<{
    grant: object;
    options: object;
}>) {
    if (!input || utilTypes.isProxy(input) || Object.getPrototypeOf(input) !== Object.prototype)
        throw refused();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (Reflect.ownKeys(descriptors).sort().join(',') !== 'grant,options' || ['grant', 'options'].some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))
        throw refused();
    const state = inspectAppsEnrichmentProvisionGrant(input.grant, input.options);
    let closing: Promise<void> | undefined, closed = false, busy = false, failed = false;
    let currentStage:AppsEnrichmentRefreshStage='worker-admission',failureStage:AppsEnrichmentRefreshStage|undefined;
    const inspect = () => { if (closed || closing)
        throw refused(); const current = inspectAppsEnrichmentProvisionGrant(input.grant, input.options); if (current !== state)
        throw refused(); state.assertCurrent(); if (state.signal.aborted)
        throw refused(); };
    const retain = <T>(original: Promise<T>): Promise<T> => { state.pending.add(original); void original.then(() => state.pending.delete(original), () => { failed = true; state.pending.delete(original); }); return original; };
    const trigger = createAppsEnrichmentWorkerTrigger(state.registry, { verify: async (admission, signal) => { currentStage='verify-ack';inspect(); if (signal !== state.signal)
            throw refused(); return retain(state.verifyAck(admission, signal)); }, execute: async (admission, signal) => {
            currentStage='provider-execute';inspect();
            const source = state.registry.workerSources.find(source => source.identity.sourceIdentityHash === admission.source.sourceIdentityHash);
            if (!source)
                throw refused();
            // The admitted worker login has already passed the production capability matrix.
            // Its repository retains original acquisitions/queries and cancels native clients.
            const work = (async () => { const clock = await state.trustedInstant(); inspect(); const result = await runAppEnrichmentWorker({ sources: [rawSourceForOwnedWorker(source)], runId: randomUUID(), scheduleId: 'apps-http-enrichment-' + state.runId, holder: randomUUID(), trustedInstant: clock, signal }, { repository: new ExplorersAppEnrichmentWorkerRepository(state.workerPool), registry: state.adapters, fetcher: config => state.ledger.fetcher(config) }); currentStage='result-verify';inspect(); if (result.kind !== 'complete' || state.ledger.inspect().firstFailure || result.receipt.counts.eligible !== 1 || result.receipt.counts.processed !== 1 || result.receipt.counts.requests !== 1 || result.receipt.counts.unavailable || result.receipt.counts.deferred || result.receipt.counts.exhausted || result.receipt.counts.cancelled || result.receipt.counts.leaseLosses)
                throw refused(); currentStage='snapshot-read';const snapshots = await state.query('SELECT s.payload FROM app_enrichment_entitlements e JOIN app_enrichment_snapshots s ON s.id=e.snapshot_id AND s.app_entity_id=e.app_entity_id WHERE e.recommendation_id=$1 AND e.account_id=$2 AND e.generation_id=$3 AND e.app_entity_id=$4', [admission.recommendationId, admission.accountId, admission.binding.currentGenerationId, admission.appEntityId]); inspect(); if (snapshots.rows.length !== 1)
                throw refused(); const snapshot = (await import('../shared/explorersAppEnrichmentContract')).appSnapshotSchema.parse(snapshots.rows[0].payload); if (snapshot.appEntityId !== admission.appEntityId || snapshot.sourceId !== source.identity.sourceId || snapshot.sourceIdentity !== source.identity.sourceIdentity || snapshot.sourceIdentityHash !== source.identity.sourceIdentityHash || snapshot.canonicalizationVersion !== source.identity.canonicalizationVersion || typeof snapshot.fields.title !== 'string')
                throw refused(); return Object.freeze({ runId: result.receipt.runId, bindingGenerationId: admission.binding.currentGenerationId!, completed: true as const }); })();
            return retain(work);
        } });
    return Object.freeze({ failureStage:()=>failureStage,async refresh(admission: AppsEnrichmentWorkerAdmission) { if (busy)
            throw refused(); busy = true;currentStage='worker-admission';failureStage=undefined; try {
            inspect();return await retain(trigger(admission, state.signal));
        }
        catch(error){failureStage=currentStage;throw error;}
        finally {
            busy = false;
        } }, close() { if (closing)
            return closing; closing = (async () => { while (state.pending.size) {
            const originals = [...state.pending], results = await Promise.allSettled(originals);
            for (const original of originals)
                state.pending.delete(original);
            if (results.some(result => result.status === 'rejected'))
                failed = true;
        } await state.close(); closed = true; if (failed)
            throw refused(); })(); return closing; } });
}
/** Explicit, qualification-only reviewed Task7 policy; additive ledger limits live separately. */
export async function createReviewedAppsEnrichmentRegistry(fatal: () => void) {
    const parsing = { maxInputBytes: 2097152, maxHtmlNodes: 50000, maxHtmlDepth: 128, maxJsonLdBlocks: 16, maxJsonBytes: 262144, maxJsonDepth: 64, maxJsonTokens: 50000 };
    const isolation = { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 8, maxConcurrentDecoders: 2, cleanupTimeoutMs: 5000 };
    const limits = { leaseDurationMs: 6000, heartbeatIntervalMs: 500, maxAttempts: 2, retryMinDelayMs: 1000, retryMaxDelayMs: 2000, retryAfterMaxMs: 2000, jobConcurrency: 2, maxJobsPerRun: 4, maxRequestsPerRun: 4, maxBytesPerRun: 8388608, maxRuntimeMs: 30000, authorityTimeoutMs: 5000, authorityCleanupTimeoutMs: 10000, maxCostUnitsPerRun: 4, costUnitsPerRequest: 1, retentionDays: 1 };
    const identity = await import('../server/application/appEnrichmentProviderIdentity'), website = await import('../server/application/appEnrichmentWebsiteAdapter'), apple = await import('../server/application/appEnrichmentAppleAdapter'), owned = await import('../server/services/appEnrichmentOwnedDecoder'), factory = await import('../server/application/appEnrichmentProviderRegistry');
    const input = { trackId: '1152747299', storefront: 'us', kind: 'software' as const }, identities = [identity.websiteProviderIdentity('https://www.figma.com/'), identity.appleProviderIdentity(input)], urls = ['https://www.figma.com/', identity.appleLookupUrl(input)];
    const sources = identities.map((item, index) => ({ identity: item, approvalRevision: 1, adapterVersion: index ? apple.appleAdapterVersion(parsing, isolation) : website.websiteAdapterVersion(parsing, isolation), allowedFields: index ? ['title', 'description', 'priceTier', 'platforms'] : ['title', 'description'], canonicalUrlPolicyVersion: item.canonicalizationVersion, canonicalUrl: urls[index], fetch: { contentProfile: index ? 'apple-json-utf8' : 'html-utf8', allowedHosts: [index ? 'itunes.apple.com' : 'www.figma.com'], redirectPolicy: 'deny', timeoutMs: 10000, maxBytes: 2097152, maxRedirects: 0, maxRequests: 1 }, limits }));
    return factory.createAppProviderRegistry({ sources, choiceLabels: identities.map((item, index) => ({ identity: item, label: index ? 'Apple App Store' : 'Figma website' })) }, parsing, isolation, owned.createAppDecoderCustody(isolation, fatal, 2));
}
