import { test, expect, type Page, type APIRequestContext, type APIResponse, type TestInfo, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v3';
import { readAppsDescriptor } from './apps-descriptor-reader.mjs';
import { APPS_ENRICHMENT_CASES, validateAppsEnrichmentReset, validateAppsEnrichmentIdentity, validateAppsEnrichmentBrowserPolicy, captureAppsEnrichmentNativeRetry, type AppsEnrichmentReset, type AppsEnrichmentWorkerAdmission } from '../../../tunes/scripts/apps-enrichment-browser-support';
import { appOwnerBindingSchema, appSnapshotSchema, appSourceChoiceSchema, appBindingResultSchema, appAcceptanceResultSchema, appEnrichmentCommandSchema, appSourceIdentitySchema, type AppOwnerBinding, type AppSnapshot, type AppSourceChoice } from '../../../tunes/shared/explorersAppEnrichmentContract';
import { editableOwnerRecommendationSchema } from '../../../tunes/shared/explorersOwnerContentContract';
import { accountDtoSchema } from '../../../tunes/shared/explorersContract';
const base = '/api/explorers/v1';
const descriptorSchema = z.object({ lane: z.literal('apps-enrichment'), version: z.literal(1), runId: z.string().regex(/^[a-f0-9]{32}$/), commit: z.string().regex(/^[a-f0-9]{40}$/), origin: z.string().regex(/^http:\/\/127\.0\.0\.1:([1-9][0-9]{3,4})$/).refine(value => Number(new URL(value).port) <= 65535), controlCapability: z.string().regex(/^[a-f0-9]{64}$/), personas: z.object({ ownerA: z.object({ userId: z.string().min(1).max(128), handle: z.string().min(3).max(30), cookie: z.string().min(3).max(4096) }).strict(), ownerB: z.object({ userId: z.string().min(1).max(128), handle: z.string().min(3).max(30), cookie: z.string().min(3).max(4096) }).strict() }).strict(), enrichmentPolicy: z.unknown() }).passthrough();
// Root owns descriptor custody, suite/source admission and every resource before collection.
function freeze<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const item of Object.values(value))
            freeze(item);
        Object.freeze(value);
    }
    return value;
}
const descriptor = freeze(descriptorSchema.parse(JSON.parse(readAppsDescriptor(process.env.REPLATFORM_E2E_FIXTURE_PATH!))));
if (process.env.REPLATFORM_E2E_LANE !== 'apps-enrichment' || descriptor.origin !== process.env.PLAYWRIGHT_EXTERNAL_BASE_URL)
    throw Error('APPS_ENRICHMENT_ORIGIN_REFUSED');
const policy = validateAppsEnrichmentBrowserPolicy(descriptor.enrichmentPolicy);
const tuple = (source: AppSourceChoice['identity']) => JSON.stringify([source.sourceId, source.sourceIdentity, source.sourceIdentityHash, source.canonicalizationVersion]);
const nativeCompletion = z.object({ runId: z.string().uuid(), bindingGenerationId: z.string().uuid(), completed: z.literal(true) }).strict();
for (const [index, title] of APPS_ENRICHMENT_CASES.entries())
    test(title, async ({ page, browser }, info) => {
        validateAppsEnrichmentIdentity({ caseId: info.title, project: info.project.name, repeat: info.repeatEachIndex });
        test.setTimeout(policy.caseTimeoutMs);
        const deadline = performance.now() + policy.caseTimeoutMs;
        const timeout = (ceiling: number = policy.requestTimeoutMs) => {
            const remaining = Math.floor(deadline - performance.now());
            if (remaining < 1)
                throw Error('APPS_ENRICHMENT_CASE_DEADLINE');
            return Math.min(ceiling, remaining);
        };
        page.setDefaultTimeout(timeout());
        page.setDefaultNavigationTimeout(timeout());
        const contexts: BrowserContext[] = [];
        async function consume(response: APIResponse, status = 200) {
            try {
                expect(response.status()).toBe(status);
                const bytes = await response.body();
                expect(bytes.byteLength).toBeLessThanOrEqual(policy.maxJsonBytes);
                return bytes.length ? JSON.parse(bytes.toString('utf8')) : null;
            }
            finally {
                await response.dispose();
            }
        }
        async function get(request: APIRequestContext, path: string, status = 200) { return consume(await request.get(base + path, { timeout: timeout() }), status); }
        async function owner(request: APIRequestContext, id: string) { const row = editableOwnerRecommendationSchema.parse((await get(request, `/recommendations/${id}/editable?status=all`)).recommendation); expect(row.category).toBe('apps'); expect(row.id).toBe(id); return row; }
        async function binding(request: APIRequestContext, id: string) { return appOwnerBindingSchema.nullable().parse((await get(request, `/recommendations/${id}/app-enrichment/binding`)).binding); }
        async function suggestions(request: APIRequestContext, id: string) { return appSnapshotSchema.array().parse((await get(request, `/recommendations/${id}/app-enrichment/suggestions`)).suggestions); }
        const envelope = { version: 1, runId: descriptor.runId, commit: descriptor.commit, caseId: info.title, project: info.project.name, repeat: 0 };
        async function control(action: 'reset-enrichment' | 'refresh-enrichment' | 'observe-enrichment', extra: Record<string, unknown> = {}) { return consume(await page.request.post('/api/__apps-fixture/control', { headers: { Origin: descriptor.origin, 'x-apps-fixture-capability': descriptor.controlCapability }, data: { action, ...envelope, ...extra }, timeout: timeout(action === 'reset-enrichment' ? policy.caseTimeoutMs : action === 'refresh-enrichment' ? policy.nativeRefreshTimeoutMs : policy.requestTimeoutMs) })); }
        async function install(context: BrowserContext, who: 'ownerA' | 'ownerB') {
            await context.route('**/*', route => new URL(route.request().url()).origin === descriptor.origin || ['data:', 'blob:'].includes(new URL(route.request().url()).protocol) ? route.continue() : route.abort());
            const native = descriptor.personas[who], position = native.cookie.indexOf('=');
            await context.addCookies([{ name: native.cookie.slice(0, position), value: native.cookie.slice(position + 1), url: descriptor.origin, httpOnly: true, sameSite: 'Lax' }]);
            const session = await consume(await context.request.get(descriptor.origin + '/api/auth/get-session', { timeout: timeout() }));
            expect(session.user.id).toBe(native.userId);
        }
        // Original promises are awaited through every failure. Root retains server/worker custody.
        async function acknowledge(id: string, method: 'PUT' | 'DELETE' | 'POST', endpoint: 'binding' | 'acceptances', expected: Record<string, unknown>, action: () => Promise<unknown>, retry?: Awaited<ReturnType<typeof captureAppsEnrichmentNativeRetry>>) {
            const path = `${base}/recommendations/${id}/app-enrichment/${endpoint}`;
            const original = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === method, { timeout: timeout() });
            let actionFailure: unknown;
            try {
                await action();
            }
            catch (error) {
                actionFailure = error;
            }
            let result: any;
            try {
                const response = await original;
                expect(response.status()).toBe(200);
                expect(appEnrichmentCommandSchema.parse(response.request().postDataJSON())).toEqual(expected);
                if (retry) {
                    expect(response.request().headers()['idempotency-key']).toBe(retry.key);
                    expect(appEnrichmentCommandSchema.parse(response.request().postDataJSON())).toEqual(retry.command);
                }
                const bytes = await response.body();
                expect(bytes.byteLength).toBeLessThanOrEqual(policy.maxJsonBytes);
                expect(await response.finished()).toBeNull();
                result = JSON.parse(bytes.toString('utf8'));
            }
            catch (error) {
                if (actionFailure)
                    throw actionFailure;
                throw error;
            }
            if (actionFailure)
                throw actionFailure;
            return result;
        }
        async function openEditor(reset: AppsEnrichmentReset, row: AppsEnrichmentReset['items'][number]) { await page.goto(`/recommendations/apps/${row.collectionId}/edit/${row.recommendation.id}`, { timeout: timeout() }); await expect(page.getByRole('heading', { name: 'Edit App', exact: true })).toBeVisible(); const panel = page.getByRole('region', { name: 'App enrichment', exact: true }); await expect(panel.getByLabel('Enrichment source')).toBeEnabled(); const choices = appSourceChoiceSchema.array().parse((await get(page.request, `/recommendations/${row.recommendation.id}/app-enrichment/sources`)).sources); expect(choices).toEqual(reset.choices); await expect(panel.getByLabel('Enrichment source')).toHaveValue(''); return panel; }
        async function configure(reset: AppsEnrichmentReset, row: AppsEnrichmentReset['items'][number], choiceIndex: number, old: AppOwnerBinding | null = null, deliveryFault = false) {
            const current = await owner(page.request, row.recommendation.id), choice = reset.choices[choiceIndex], panel = page.getByRole('region', { name: 'App enrichment', exact: true });
            await panel.getByLabel('Enrichment source').selectOption(String(choiceIndex));
            const command = { ...choice.identity, operation: 'configureAppEnrichment', optIn: true, expectedRecommendationRevision: current.revision, expectedBindingRevision: old?.bindingRevision ?? null };
            let captured: Awaited<ReturnType<typeof captureAppsEnrichmentNativeRetry>> | undefined;
            if (deliveryFault) {
                const path = base + '/recommendations/' + current.id + '/app-enrichment/binding';
                let original: Promise<Awaited<ReturnType<typeof captureAppsEnrichmentNativeRetry>>> | undefined;
                const handler = (route: import('@playwright/test').Route) => {
                    if (route.request().method() !== 'PUT' || new URL(route.request().url()).origin !== descriptor.origin)
                        throw Error('APPS_ENRICHMENT_FAULT_SCOPE_REFUSED');
                    original = captureAppsEnrichmentNativeRetry(command, { key: route.request().headers()['idempotency-key'], command: route.request().postDataJSON(), fetch: () => route.fetch({ timeout: timeout(), maxRedirects: 0 }), abort: () => route.abort('failed') }, policy.maxJsonBytes);
                    return original.then(() => undefined);
                };
                await page.route(descriptor.origin + path, handler, { times: 1 });
                let firstFailure = false;
                try {
                    await panel.getByRole('button', { name: 'Enable nightly refresh', exact: true }).click();
                    await expect(panel.getByRole('button', { name: 'Retry same request', exact: true })).toBeEnabled();
                    if (!original)
                        throw Error('APPS_ENRICHMENT_NATIVE_FAULT_NOT_OBSERVED');
                    captured = await original;
                    await expect(panel.getByLabel('Enrichment source')).toBeDisabled();
                }
                catch (error) {
                    firstFailure = true;
                    throw error;
                }
                finally {
                    const clean = await Promise.allSettled([page.unroute(descriptor.origin + path, handler), ...(original ? [original] : [])]);
                    if (!firstFailure && clean.some(result => result.status === 'rejected'))
                        throw Error('APPS_ENRICHMENT_NATIVE_FAULT_UNSETTLED');
                }
            }
            const result = appBindingResultSchema.parse((await acknowledge(current.id, 'PUT', 'binding', command, () => panel.getByRole('button', { name: captured ? 'Retry same request' : old ? 'Re-enable nightly refresh' : 'Enable nightly refresh', exact: true }).click(), captured)).binding);
            if (captured) {
                expect(result).toEqual(captured.binding);
                expect(result.receiptId).toBe(captured.binding.receiptId);
            }
            expect(result.recommendationId).toBe(current.id);
            const active = await binding(page.request, current.id);
            expect(active?.optIn).toBe(true);
            expect(active?.currentSource).toEqual(choice.identity);
            expect(active?.bindingRevision).toBe(result.bindingRevision);
            expect(active?.currentGenerationId).toBe(result.bindingGenerationId);
            return { result, active: active! };
        }
        async function refresh(reset: AppsEnrichmentReset, row: AppsEnrichmentReset['items'][number], configured: Awaited<ReturnType<typeof configure>>) {
            const current = await owner(page.request, row.recommendation.id);
            const admission: AppsEnrichmentWorkerAdmission = { identity: { caseId: reset.caseId, project: reset.project, repeat: 0 }, runId: reset.runId, commit: reset.commit, epoch: reset.epoch, accountId: current.accountId, recommendationId: current.id, appEntityId: current.entityId, binding: configured.active, source: configured.active.currentSource!, expectedRecommendationRevision: current.revision, expectedBindingRevision: configured.active.bindingRevision, bindingReceiptId: configured.result.receiptId };
            expect(current.revision).toBe(configured.result.recommendationRevision);
            const completed = nativeCompletion.parse(await control('refresh-enrichment', { epoch: reset.epoch, admission }));
            expect(completed.bindingGenerationId).toBe(configured.active.currentGenerationId);
            const rows = await suggestions(page.request, current.id);
            expect(rows.length).toBeGreaterThan(0);
            for (const snapshot of rows) {
                expect(snapshot.appEntityId).toBe(current.entityId);
                expect(tuple(snapshot)).toBe(tuple(admission.source));
                for (const field of Object.keys(snapshot.fields)) {
                    const provenance = snapshot.fieldProvenance[field as keyof typeof snapshot.fieldProvenance]!;
                    expect(provenance.sourceUrl).toBe(reset.choices.find(choice => tuple(choice.identity) === tuple(admission.source))!.sourceUrl);
                    expect(provenance.observedAt).toBe(snapshot.fetchedAt);
                }
            }
            return rows;
        }
        async function staleAcceptance(id: string, current: AppOwnerBinding, snapshot: AppSnapshot) { const recommendation = await owner(page.request, id); return consume(await page.request.post(`${base}/recommendations/${id}/app-enrichment/acceptances`, { headers: { Origin: descriptor.origin, 'Idempotency-Key': randomUUID() }, data: appEnrichmentCommandSchema.parse({ operation: 'acceptAppEnrichment', snapshotId: snapshot.snapshotId, selectedFields: ['title'], expectedRecommendationRevision: recommendation.revision, expectedBindingRevision: current.bindingRevision }), timeout: timeout() }), 409); }
        let primaryFailure = false;
        try {
            await install(page.context(), 'ownerA');
            const reset = validateAppsEnrichmentReset(await control('reset-enrichment'));
            for (const key of ['version', 'runId', 'commit', 'caseId', 'project', 'repeat'] as const)
                expect(reset[key]).toBe(envelope[key]);
            const a = accountDtoSchema.parse((await get(page.request, '/me')).account);
            expect(a.id).toBe(reset.personas.ownerA.accountId);
            expect(a.handle).toBe(descriptor.personas.ownerA.handle);
            for (const who of ['ownerA', 'ownerB'] as const) {
                expect(reset.personas[who].userId).toBe(descriptor.personas[who].userId);
                expect(reset.personas[who].handle).toBe(descriptor.personas[who].handle);
            }
            const foreign = await browser.newContext({ baseURL: descriptor.origin });
            contexts.push(foreign);
            await install(foreign, 'ownerB');
            expect(accountDtoSchema.parse((await get(foreign.request, '/me')).account).id).toBe(reset.personas.ownerB.accountId);
            const anonymous = await browser.newContext({ baseURL: descriptor.origin });
            contexts.push(anonymous);
            const foreignControl = reset.items[2], foreignBefore = await owner(foreign.request, foreignControl.recommendation.id);
            if (index === 0) {
                for (const [choiceIndex, row] of reset.items.slice(0, 2).entries()) {
                    const before = await owner(page.request, row.recommendation.id);
                    const { categoryRevision: initialCategory, ...initialRow } = row.recommendation, { categoryRevision: currentCategory, ...currentRow } = before;
                    expect(currentRow).toEqual(initialRow);
                    expect(Number(currentCategory)).toBeGreaterThanOrEqual(Number(initialCategory));
                    expect(await binding(page.request, before.id)).toBeNull();
                    expect(await suggestions(page.request, before.id)).toEqual([]);
                    await openEditor(reset, row);
                    const configured = await configure(reset, row, choiceIndex), snapshots = await refresh(reset, row, configured);
                    const offered = await owner(page.request, before.id);
                    expect(offered.entity).toEqual(before.entity);
                    expect(offered.displayOverrides).toEqual(before.displayOverrides);
                    expect(offered.effectiveAppDetails).toEqual(before.effectiveAppDetails);
                    const snapshot = snapshots[0];
                    expect(typeof snapshot.fields.title).toBe('string');
                    await page.reload({ timeout: timeout() });
                    const panel = page.getByRole('region', { name: 'App enrichment', exact: true });
                    await expect(panel.getByRole('checkbox', { name: 'Title', exact: true }).first()).toBeEnabled();
                    await panel.getByRole('checkbox', { name: 'Title', exact: true }).first().check();
                    const observed = await owner(page.request, before.id), active = await binding(page.request, before.id);
                    const accepted = appAcceptanceResultSchema.parse((await acknowledge(before.id, 'POST', 'acceptances', { operation: 'acceptAppEnrichment', snapshotId: snapshot.snapshotId, selectedFields: ['title'], expectedRecommendationRevision: observed.revision, expectedBindingRevision: active!.bindingRevision }, () => panel.getByRole('button', { name: 'Accept selected fields', exact: true }).first().click())).acceptance);
                    expect(accepted.acceptedFields).toEqual(['title']);
                    expect(accepted.snapshotId).toBe(snapshot.snapshotId);
                    const after = await owner(page.request, before.id);
                    expect(after.displayTitle).toBe(snapshot.fields.title);
                    expect(after.displayOverrides).toEqual({ ...before.displayOverrides, title: snapshot.fields.title });
                    expect(after.entity).toEqual(before.entity);
                    expect(after.effectiveAppDetails).toEqual(before.effectiveAppDetails);
                    expect(after.note).toEqual(before.note);
                    expect(after.userRating).toBe(before.userRating);
                    expect(after.appScreenshots).toEqual(before.appScreenshots);
                    await page.goto(`/recommendations/apps/${row.collectionId}`, { timeout: timeout() });
                    await expect(page.getByText(snapshot.fields.title!, { exact: true })).toBeVisible();
                    await page.reload({ timeout: timeout() });
                    await expect(page.getByText(snapshot.fields.title!, { exact: true })).toBeVisible();
                    await openEditor(reset, row);
                    await expect(page.getByLabel('App title', { exact: true })).toHaveValue(snapshot.fields.title!);
                    for (const endpoint of ['binding', 'suggestions', 'sources']) {
                        await get(foreign.request, `/recommendations/${before.id}/app-enrichment/${endpoint}`, 404);
                        await get(anonymous.request, `/recommendations/${before.id}/app-enrichment/${endpoint}`, 401);
                    }
                    const denied = appEnrichmentCommandSchema.parse({ operation: 'disableAppEnrichment', expectedRecommendationRevision: after.revision, expectedBindingRevision: active!.bindingRevision });
                    for (const [request, status] of [[foreign.request, 404], [anonymous.request, 401]] as const)
                        await consume(await request.delete(`${base}/recommendations/${before.id}/app-enrichment/binding`, { headers: { Origin: descriptor.origin, 'Idempotency-Key': randomUUID() }, data: denied, timeout: timeout() }), status);
                }
            }
            else {
                const row = reset.items[0], before = await owner(page.request, row.recommendation.id);
                await openEditor(reset, row);
                const configured = await configure(reset, row, 0, null, true), snapshots = await refresh(reset, row, configured), snapshot = snapshots[0];
                expect(typeof snapshot.fields.title).toBe('string');
                await page.reload({ timeout: timeout() });
                let panel = page.getByRole('region', { name: 'App enrichment', exact: true });
                await page.getByLabel('App title', { exact: true }).fill('Unsaved fixture manual title');
                await expect(panel.getByLabel('Enrichment source')).toBeDisabled();
                await expect(panel.getByRole('checkbox', { name: 'Title', exact: true }).first()).toBeDisabled();
                await expect(panel.getByText('Save or revert your manual edits before changing enrichment or accepting suggestions.')).toBeVisible();
                await page.reload({ timeout: timeout() });
                await expect(page.getByLabel('App title', { exact: true })).toHaveValue(before.displayTitle!);
                panel = page.getByRole('region', { name: 'App enrichment', exact: true });
                const observed = await owner(page.request, before.id), active = await binding(page.request, before.id);
                const disabled = appBindingResultSchema.parse((await acknowledge(before.id, 'DELETE', 'binding', { operation: 'disableAppEnrichment', expectedRecommendationRevision: observed.revision, expectedBindingRevision: active!.bindingRevision }, () => panel.getByRole('button', { name: 'Disable enrichment', exact: true }).click())).binding);
                const off = await binding(page.request, before.id);
                expect(off!.optIn).toBe(false);
                expect(off!.currentGenerationId).toBe(active!.currentGenerationId);
                expect(off!.bindingRevision).toBe(disabled.bindingRevision);
                await staleAcceptance(before.id, active!, snapshot);
                await page.reload({ timeout: timeout() });
                const again = await configure(reset, row, 0, off!);
                expect(again.active.currentGenerationId).toBe(active!.currentGenerationId);
                expect(again.active.bindingRevision).toBeGreaterThan(off!.bindingRevision);
                expect((await suggestions(page.request, before.id)).map(row => row.snapshotId)).toContain(snapshot.snapshotId);
                await page.reload({ timeout: timeout() });
                panel = page.getByRole('region', { name: 'App enrichment', exact: true });
                await panel.getByLabel('Enrichment source').selectOption('1');
                const current = await owner(page.request, before.id), apple = reset.choices[1];
                const rebound = appBindingResultSchema.parse((await acknowledge(before.id, 'PUT', 'binding', { ...apple.identity, operation: 'rebindAppEnrichment', optIn: true, expectedRecommendationRevision: current.revision, expectedBindingRevision: again.active.bindingRevision }, () => panel.getByRole('button', { name: 'Change source', exact: true }).click())).binding);
                const final = await binding(page.request, before.id);
                expect(final!.currentGenerationId).not.toBe(active!.currentGenerationId);
                expect(final!.currentGenerationId).toBe(rebound.bindingGenerationId);
                expect(final!.currentSource).toEqual(apple.identity);
                expect(await suggestions(page.request, before.id)).toEqual([]);
                await staleAcceptance(before.id, final!, snapshot);
                const after = await owner(page.request, before.id);
                expect(after.entity).toEqual(before.entity);
                expect(after.displayOverrides).toEqual(before.displayOverrides);
                expect(after.displayTitle).toBe(before.displayTitle);
                expect(after.effectiveAppDetails).toEqual(before.effectiveAppDetails);
                expect(after.note).toEqual(before.note);
                expect(after.userRating).toBe(before.userRating);
                expect(after.appScreenshots).toEqual(before.appScreenshots);
                await page.reload({ timeout: timeout() });
                await expect(page.getByLabel('App title', { exact: true })).toHaveValue(before.displayTitle!);
                expect(await binding(page.request, before.id)).toEqual(final);
                await expect(page.getByRole('region', { name: 'App enrichment', exact: true }).getByText('No owned suggestions are available.', { exact: true })).toBeVisible();
            }
            expect(await owner(foreign.request, foreignControl.recommendation.id)).toEqual(foreignBefore);
            expect(await binding(foreign.request, foreignControl.recommendation.id)).toBeNull();
            expect(await suggestions(foreign.request, foreignControl.recommendation.id)).toEqual([]);
            const observed = await control('observe-enrichment', { epoch: reset.epoch });
            expect(observed).toEqual({ ...envelope, epoch: reset.epoch, completed: true });
        }
        catch (error) {
            primaryFailure = true;
            throw error;
        }
        finally {
            const settled = await Promise.allSettled(contexts.map(context => context.close()));
            if (!primaryFailure && settled.some(result => result.status === 'rejected'))
                throw Error('APPS_ENRICHMENT_CONTEXT_CLEANUP_UNSETTLED');
        }
    });
