import { editableOwnerCollectionSchema, editableOwnerRecommendationSchema } from '../shared/explorersOwnerContentContract';
import { types as utilTypes } from 'node:util';
import { z } from 'zod/v3';
import { appSourceChoiceSchema, appSourceIdentitySchema, appOwnerBindingSchema, appEnrichmentCommandSchema, appBindingResultSchema, type AppSourceChoice, type AppOwnerBinding } from '../shared/explorersAppEnrichmentContract';
import { validateAppWorkerSources, type ApprovedAppWorkerSource } from '../server/application/appEnrichmentWorkerValidation';
import { websiteProviderIdentity, appleProviderIdentity, appleLookupUrl } from '../server/application/appEnrichmentProviderIdentity';
export const APPS_ENRICHMENT_CASES = Object.freeze([
    'Apps enrichment: explicit approved source choices and selected-field acceptance survive reload',
    'Apps enrichment: disable same-source re-enable and different-source rebind preserve manual values',
] as const);
export const APPS_ENRICHMENT_PROJECTS = Object.freeze(['apps-desktop', 'apps-mobile'] as const);
export const APPS_ENRICHMENT_IDENTITIES = Object.freeze(APPS_ENRICHMENT_CASES.flatMap(caseId => APPS_ENRICHMENT_PROJECTS.map(project => Object.freeze({ caseId, project, repeat: 0 as const }))));
export const APPS_ENRICHMENT_BOUNDS = Object.freeze({ maxActualGets: 8, maxReservedBodyBytes: 16 * 1024 * 1024 });
const identitySchema = z.object({ caseId: z.enum(APPS_ENRICHMENT_CASES), project: z.enum(APPS_ENRICHMENT_PROJECTS), repeat: z.literal(0) }).strict();
export type AppsEnrichmentIdentity = z.infer<typeof identitySchema>;
const refused = () => Error('Apps enrichment fixture admission refused');
/** Strict data copying happens before schema access. This module creates no resources. */
function data(input: unknown, depth = 0, budget = { nodes: 0 }): any {
    if (++budget.nodes > 2048 || depth > 32)
        throw refused();
    if (input === null || typeof input === 'string' || typeof input === 'boolean' || typeof input === 'number' && Number.isFinite(input))
        return input;
    if (!input || typeof input !== 'object' || utilTypes.isProxy(input))
        throw refused();
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input) !== (array ? Array.prototype : Object.prototype))
        throw refused();
    const descriptors = Object.getOwnPropertyDescriptors(input);
    if (array) {
        const length = descriptors.length?.value;
        if (!Number.isSafeInteger(length) || length < 0 || length > 256 || Reflect.ownKeys(descriptors).length !== length + 1)
            throw refused();
        const result = [];
        for (let i = 0; i < length; i++) {
            const d = descriptors[String(i)];
            if (!d?.enumerable || !Object.hasOwn(d, 'value'))
                throw refused();
            result.push(data(d.value, depth + 1, budget));
        }
        return result;
    }
    const result: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string')
            throw refused();
        const d = descriptors[key];
        if (!d.enumerable || !Object.hasOwn(d, 'value'))
            throw refused();
        Object.defineProperty(result, key, { value: data(d.value, depth + 1, budget), enumerable: true });
    }
    return result;
}
function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const item of Object.values(value))
            freeze(item);
        Object.freeze(value);
    }
    return value;
}
export function validateAppsEnrichmentIdentity(input: unknown): AppsEnrichmentIdentity { return freeze(identitySchema.parse(data(input))); }
const apple = Object.freeze({ trackId: '1152747299', storefront: 'us', kind: 'software' as const });
const approved = Object.freeze([{ identity: websiteProviderIdentity('https://www.figma.com/'), url: 'https://www.figma.com/', profile: 'html-utf8' }, { identity: appleProviderIdentity(apple), url: appleLookupUrl(apple), profile: 'apple-json-utf8' }]);
const key = (identity: AppSourceChoice['identity']) => JSON.stringify([identity.sourceId, identity.sourceIdentity, identity.sourceIdentityHash, identity.canonicalizationVersion]);
export type AppsEnrichmentRegistryBinding = Readonly<{
    workerSources: readonly ApprovedAppWorkerSource[];
    choices: readonly AppSourceChoice[];
}>;
/** Root passes a captured registry subset, never request configuration or inferred labels. */
export function createAppsEnrichmentRegistryBinding(input: unknown): AppsEnrichmentRegistryBinding {
    try {
        const captured = data(input);
        if (Object.keys(captured).sort().join(',') !== 'choices,workerSources' || !Array.isArray(captured.workerSources) || captured.workerSources.length !== 2)
            throw refused();
        const fingerprints = captured.workerSources.map((s: any) => s.configurationFingerprint), sources = validateAppWorkerSources(captured.workerSources.map(({ configurationFingerprint: _fingerprint, ...source }: any) => source)).sources, choices = appSourceChoiceSchema.array().length(2).parse(captured.choices);
        for (let i = 0; i < 2; i++) {
            const source = sources[i], expected = approved[i], choice = choices[i];
            if (source.configurationFingerprint !== fingerprints[i] || key(source.identity) !== key(expected.identity) || source.canonicalUrl !== expected.url || source.fetch.contentProfile !== expected.profile || source.fetch.redirectPolicy !== 'deny' || source.fetch.maxRedirects !== 0 || source.fetch.maxRequests !== 1 || source.fetch.maxBytes > 2 * 1024 * 1024 || key(choice.identity) !== key(source.identity) || choice.sourceUrl !== source.canonicalUrl)
                throw refused();
        }
        return freeze({ workerSources: sources, choices });
    }
    catch {
        throw refused();
    }
}
/** Root must authenticate this identity and confirm the current row AFTER native HTTP ack.
 * No arbitrary source, URL, SQL, executable, clock, or worker policy crosses control IPC. */
export type AppsEnrichmentWorkerAdmission = Readonly<{
    identity: AppsEnrichmentIdentity;
    runId: string;
    commit: string;
    epoch: number;
    accountId: string;
    recommendationId: string;
    appEntityId: string;
    binding: AppOwnerBinding;
    source: AppSourceChoice['identity'];
    expectedRecommendationRevision: number;
    expectedBindingRevision: number;
    bindingReceiptId: string;
}>;
export type AppsEnrichmentNativeWorkerTrigger = (admission: AppsEnrichmentWorkerAdmission, signal: AbortSignal) => Promise<Readonly<{
    runId: string;
    bindingGenerationId: string;
    completed: true;
}>>;
export function validateAppsEnrichmentSources(input: unknown): readonly AppSourceChoice['identity'][] {
    try {
        const sources = appSourceIdentitySchema.array().length(2).parse(data(input));
        if (sources.some((source, index) => key(source) !== key(approved[index].identity)))
            throw refused();
        return freeze(sources);
    }
    catch {
        throw refused();
    }
}
const nativeAdmissionSchema = z.object({ identity: identitySchema, runId: z.string().regex(/^[a-f0-9]{32}$/), commit: z.string().regex(/^[a-f0-9]{40}$/), epoch: z.number().int().min(1).max(4), accountId: z.string().uuid(), recommendationId: z.string().uuid(), appEntityId: z.string().uuid(), binding: appOwnerBindingSchema, source: appSourceIdentitySchema, expectedRecommendationRevision: z.number().int().positive().safe(), expectedBindingRevision: z.number().int().positive().safe(), bindingReceiptId: z.string().uuid() }).strict().superRefine((v, context) => {
    if (!v.binding.optIn || !v.binding.currentGenerationId || !v.binding.currentSource || key(v.binding.currentSource) !== key(v.source) || v.binding.accountId !== v.accountId || v.binding.recommendationId !== v.recommendationId || v.binding.appEntityId !== v.appEntityId || v.binding.bindingRevision !== v.expectedBindingRevision)
        context.addIssue({ code: 'custom', message: 'Native binding acknowledgement mismatch' });
});
const nativeCompletionSchema = z.object({ runId: z.string().uuid(), bindingGenerationId: z.string().uuid(), completed: z.literal(true) }).strict();
export type AppsEnrichmentWorkerDependencies = Readonly<{
    verify: (admission: AppsEnrichmentWorkerAdmission, signal: AbortSignal) => Promise<boolean>;
    execute: AppsEnrichmentNativeWorkerTrigger;
}>;
const nativeAborted = Object.getOwnPropertyDescriptor(AbortSignal.prototype, 'aborted')!.get!;
/** No authority is minted here. Root's closed verifier authenticates native receipts,
 * row state and exact resource identity; its executor retains all original worker work. */
export function createAppsEnrichmentWorkerTrigger(registryInput: unknown, dependencies: AppsEnrichmentWorkerDependencies): AppsEnrichmentNativeWorkerTrigger {
    const registry = createAppsEnrichmentRegistryBinding(registryInput);
    if (!dependencies || typeof dependencies !== 'object' || utilTypes.isProxy(dependencies) || Object.getPrototypeOf(dependencies) !== Object.prototype)
        throw refused();
    const descriptors = Object.getOwnPropertyDescriptors(dependencies);
    if (Reflect.ownKeys(descriptors).sort().join(',') !== 'execute,verify')
        throw refused();
    for (const name of ['verify', 'execute']) {
        const descriptor = descriptors[name];
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'function' || utilTypes.isProxy(descriptor.value))
            throw refused();
    }
    const verify = descriptors.verify.value as AppsEnrichmentWorkerDependencies['verify'], execute = descriptors.execute.value as AppsEnrichmentNativeWorkerTrigger;
    return async (input, signal) => {
        if (nativeAborted.call(signal))
            throw refused();
        const admission = freeze(nativeAdmissionSchema.parse(data(input)));
        if (!registry.choices.some(choice => key(choice.identity) === key(admission.source)) || await verify(admission, signal) !== true || nativeAborted.call(signal))
            throw refused();
        const original = execute(admission, signal);
        const result = nativeCompletionSchema.parse(data(await original));
        if (nativeAborted.call(signal) || result.bindingGenerationId !== admission.binding.currentGenerationId)
            throw refused();
        return freeze(result);
    };
}
const resetSchema = z.object({ version: z.literal(1), runId: z.string().regex(/^[a-f0-9]{32}$/), commit: z.string().regex(/^[a-f0-9]{40}$/), caseId: identitySchema.shape.caseId, project: identitySchema.shape.project, repeat: z.literal(0), epoch: z.number().int().min(1).max(4), personas: z.object({ ownerA: z.object({ userId: z.string().min(1).max(128), accountId: z.string().uuid(), handle: z.string().regex(/^[a-z][a-z0-9-]{2,29}$/) }).strict(), ownerB: z.object({ userId: z.string().min(1).max(128), accountId: z.string().uuid(), handle: z.string().regex(/^[a-z][a-z0-9-]{2,29}$/) }).strict() }).strict(), choices: appSourceChoiceSchema.array().length(2), collections: editableOwnerCollectionSchema.array().length(2), items: z.object({ role: z.enum(['website', 'apple', 'foreign-control']), collectionId: z.string().uuid(), recommendation: editableOwnerRecommendationSchema }).strict().array().length(3) }).strict().superRefine((v, context) => {
    const bad = () => context.addIssue({ code: 'custom', message: 'Native Apps allocation mismatch' });
    if (v.personas.ownerA.userId === v.personas.ownerB.userId || v.personas.ownerA.accountId === v.personas.ownerB.accountId || v.personas.ownerA.handle === v.personas.ownerB.handle)
        bad();
    if (v.choices.some((choice, index) => key(choice.identity) !== key(approved[index].identity) || choice.sourceUrl !== approved[index].url))
        bad();
    if (v.collections.some((row, index) => row.category !== 'apps' || row.accountId !== v.personas[index === 0 ? 'ownerA' : 'ownerB'].accountId || row.archived) || new Set(v.collections.map(row => row.id)).size !== 2)
        bad();
    if (v.items.map(row => row.role).join(',') !== 'website,apple,foreign-control' || new Set(v.items.map(row => row.recommendation.id)).size !== 3 || new Set(v.items.map(row => row.recommendation.entityId)).size !== 3)
        bad();
    for (const row of v.items) {
        const recommendation = row.recommendation, owner = row.role === 'foreign-control' ? 'ownerB' : 'ownerA';
        if (recommendation.category !== 'apps' || recommendation.accountId !== v.personas[owner].accountId || recommendation.entity.kind !== 'app' || !('origin' in recommendation.entity) || recommendation.entity.origin !== 'manual' || recommendation.archived || Object.keys(recommendation.displayOverrides).length || !v.collections.some(parent => parent.id === row.collectionId && parent.accountId === recommendation.accountId))
            bad();
    }
});
export type AppsEnrichmentReset = z.infer<typeof resetSchema>;
/** Strict native row shape is data validation, not an issuance/worker authority. */
export function validateAppsEnrichmentReset(input: unknown): AppsEnrichmentReset { return freeze(resetSchema.parse(data(input))); }
const browserPolicySchema = z.object({ requestTimeoutMs: z.literal(15000), maxJsonBytes: z.literal(65536), nativeRefreshTimeoutMs: z.literal(60000), caseTimeoutMs: z.literal(120000) }).strict();
export type AppsEnrichmentBrowserPolicy = z.infer<typeof browserPolicySchema>;
export function validateAppsEnrichmentBrowserPolicy(input: unknown): AppsEnrichmentBrowserPolicy { return freeze(browserPolicySchema.parse(data(input))); }
export type AppsEnrichmentNativeRetryCapture = Readonly<{
    key: string;
    command: z.infer<typeof appEnrichmentCommandSchema>;
    binding: z.infer<typeof appBindingResultSchema>;
}>;
/** A supplied native route effect, never a positive response mock or worker authority. */
export async function captureAppsEnrichmentNativeRetry(expectedInput: unknown, effects: {
    key: unknown;
    command: unknown;
    fetch: () => Promise<{
        status(): number;
        body(): Promise<Buffer>;
        dispose(): Promise<void>;
    }>;
    abort: () => Promise<void>;
}, maxJsonBytes: 65536): Promise<AppsEnrichmentNativeRetryCapture> {
    if (maxJsonBytes !== 65536)
        throw refused();
    const expected = appEnrichmentCommandSchema.parse(data(expectedInput)), command = appEnrichmentCommandSchema.parse(data(effects.command)), capturedKey = z.string().uuid().parse(effects.key);
    if (command.operation !== 'configureAppEnrichment' || JSON.stringify(command) !== JSON.stringify(expected))
        throw refused();
    const response = await effects.fetch();
    let binding: z.infer<typeof appBindingResultSchema>;
    try {
        if (response.status() !== 200)
            throw refused();
        const bytes = await response.body();
        if (bytes.byteLength > maxJsonBytes)
            throw refused();
        binding = z.object({ binding: appBindingResultSchema }).strict().parse(JSON.parse(bytes.toString('utf8'))).binding;
    }
    finally {
        await response.dispose();
    }
    await effects.abort();
    return freeze({ key: capturedKey, command, binding });
}
