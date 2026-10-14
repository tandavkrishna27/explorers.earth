import {isNativeError,isProxy} from 'node:util/types';
import {firstPeopleServedModuleFrame} from './people-served-module-diagnostic';
import { readPublicPageRows, PUBLIC_PROFILE_PAGE_FIELDS, placePageCursor } from '../../src/features/PublicHome/api/publicProfilePagination';
import { gamesPublicPageSchema } from '../../../tunes/shared/explorersGameOwnerContract';
import { guideAggregateDtoSchema, writeGuideSectionSchema } from '../../../tunes/shared/explorersGuideContract';
import { errors, expect, type Browser, type BrowserContext, type Page, type TestInfo, type APIResponse, type Response } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { z } from 'zod/v3';
import { createPublicParityHarnessClient, publicParityNativeDependencies, PUBLIC_PARITY_QUALIFICATION_POLICY,type PeopleColdEntry,type PublicNavigation,type PublicOwnerReturn } from './public-parity-controller';
import {PUBLIC_PARITY_CASES,PEOPLE_CASES,type PublicParityIssuedManifest,type PublicParityObservation} from '../../../tunes/scripts/public-parity-browser-support';
import { accountDtoSchema, updateAccountRequestSchema, updateCollectionSchema, updateRecommendationSchema, categoryTopPicksInputSchema, categoryTopPicksResultSchema } from '../../../tunes/shared/explorersContract';
import { editableOwnerRecommendationSchema, editableOwnerCollectionSchema, ownerSnapshotSchema } from '../../../tunes/shared/explorersOwnerContentContract';
export const BASE = '/api/explorers/v1';
export type Client = ReturnType<typeof createPublicParityHarnessClient>;
export type Scope = {
    client: Client;
    manifest: PublicParityIssuedManifest;
    context(owner: 'ownerA' | 'ownerB' | 'anonymous'): Promise<BrowserContext>;
    freshContext(owner: 'ownerA'): Promise<BrowserContext>;
    read(context: BrowserContext, path: string, status?: number, headers?: Record<string, string>): Promise<{
        body: any;
        headers: Record<string, string>;
        status: number;
    }>;
    observe(): Promise<PublicParityObservation>;
};
export function qualificationClient() { return createPublicParityHarnessClient(process.env, publicParityNativeDependencies, PUBLIC_PARITY_QUALIFICATION_POLICY); }
export async function runOwnedCase(client: Client, browser: Browser, info: TestInfo, body: (scope: Scope) => Promise<void>) {
    if (info.repeatEachIndex !== 0)
        throw Error('PUBLIC_PARITY_REPEAT_REFUSED');
    const manifest = await client.start({ caseId: info.title, project: info.project.name, repeat: 0 } as Parameters<Client['start']>[0]);
    const contexts = new Map<string, BrowserContext>();
    const options = info.project.name.endsWith('-mobile') ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1365, height: 900 } };
    const scope: Scope = { client, manifest, context: async (owner) => {
            let value = contexts.get(owner);
            if (!value) {
                value = await client.createContext(browser, owner, options);
                contexts.set(owner, value);
            }
            return value;
        }, freshContext: async (owner) => { const context = await client.createContext(browser, owner, options); contexts.set('fresh-' + contexts.size, context); return context; }, read: async (context, path, status = 200, headers = {}) => client.trackProducer(async () => { const reply = await context.request.get(path.startsWith('/api/') ? path : BASE + path, { headers, timeout: Math.min(client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) }); return consume(reply, status); }), observe: () => client.observe() };
    try {
        await client.trackProducer(() => body(scope));
        await scope.observe();
        for (const context of contexts.values())
            await client.closeContext(context);
        await client.retire();
    }
    catch (error) {
        try {
            await client.fail();
        }
        catch { /* Root retains unknown original work and owns final drain. */ }
        throw error;
    }
}
export async function consume(reply: APIResponse, status: number) {
    try {
        expect(reply.status()).toBe(status);
        const bytes = await reply.body();
        expect(bytes.byteLength).toBeLessThanOrEqual(PUBLIC_PARITY_QUALIFICATION_POLICY.responseBytes);
        return { status: reply.status(), headers: reply.headers(), body: bytes.length ? JSON.parse(bytes.toString('utf8')) : null };
    }
    finally {
        await reply.dispose();
    }
}
export function graph(scope: Scope, category: PublicParityIssuedManifest['categories'][number]['category']) { const value = scope.manifest.categories.find(row => row.category === category); expect(value).toBeDefined(); return value!; }
export function target(scope: Scope, category: PublicParityIssuedManifest['categories'][number]['category'], owner: 'ownerA' | 'ownerB' = 'ownerA') { const row = graph(scope, category).lists.find(row => row.accountId === scope.manifest.personas[owner].accountId && row.control === null); expect(row).toBeDefined(); return row!; }
export function categoryURL(handle: string, category: string) { return `${BASE}/profiles/${handle}/recommendations/${category}`; }
export function genericURL(handle: string, category: string, slug?: string) { return `${BASE}/public/profiles/${handle}/collections/${category}${slug ? `/${slug}/recommendations` : ''}`; }
const pageSchema = z.object({ version: z.literal('explorers-public-content/v1'), items: z.array(z.object({ id: z.string().uuid() }).passthrough()), nextCursor: z.string().nullable() }).passthrough();
export async function orderedPages(scope: Scope, context: BrowserContext, path: string, expected: string[], limit: 12 | 24) {
    const ids: string[] = [], seen = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
        const response = await scope.read(context, `${path}?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`), body = pageSchema.parse(response.body);
        validateTraversalPage(expected, ids.length, body.items.map(row => row.id), body.nextCursor, limit, seen);
        ids.push(...body.items.map(row => row.id));
        cursor = body.nextCursor;
        if (cursor === null) {
            expect(ids).toEqual(expected);
            return ids;
        }
    }
    throw Error('PUBLIC_PARITY_CURSOR_UNSETTLED');
}
function attachPeopleColdDiagnostic(scope:Scope,page:Page,path:string){if(scope.manifest.family!=='people'||scope.manifest.caseId!==PEOPLE_CASES[3]||scope.manifest.project!=='people-mobile'||scope.manifest.epoch!==10)return;const origin=scope.manifest.origin,username=scope.manifest.personas.ownerA.handle,match=new RegExp('^/'+username+'/people/([a-zA-Z0-9_-]+)$').exec(path);if(!match)return;const shell=BASE+'/profiles/'+username,detail=shell+'/recommendations/people/'+match[1];let active=true;const value:{-readonly [K in keyof PeopleColdEntry]:PeopleColdEntry[K]}={operation:'navigation',shellSeen:0,shellStatus:null,detailSeen:0,detailStatus:null,pageErrors:0,overflow:false};const response=(reply:Response)=>{if(!active)return;try{if(reply.request().method()!=='GET')return;const url=new URL(reply.url());if(url.origin!==origin)return;const key=url.pathname===shell?'shell':url.pathname===detail?'detail':undefined;if(!key)return;const count=key==='shell'?'shellSeen':'detailSeen',status=key==='shell'?'shellStatus':'detailStatus';if(value[count]<64)value[count]++;else value.overflow=true;value[status]=null;const observed=reply.status();if(Number.isInteger(observed)&&observed>=100&&observed<=599)value[status]=observed;else{value[status]=null;value.overflow=true;}}catch{value.overflow=true;}};const pageError=(error:unknown)=>{if(!active)return;const first=value.pageErrors===0;if(value.pageErrors<64)value.pageErrors++;else value.overflow=true;if(first){const frame=firstPeopleServedModuleFrame(error,origin);if(frame)value.firstPageErrorFrame=frame;}};const detach=()=>{if(!active)return;active=false;try{page.off('response',response);}catch{value.overflow=true;}try{page.off('pageerror',pageError);}catch{value.overflow=true;}};try{page.on('response',response);page.on('pageerror',pageError);}catch{value.overflow=true;detach();}return Object.freeze({operation(operation:PeopleColdEntry['operation']){value.operation=operation;},snapshot:()=>Object.freeze({...value}),detach});}
export async function cold(scope: Scope, context: BrowserContext, path: string, title: string) { const page = await scope.client.trackProducer(() => context.newPage());let diagnostic:ReturnType<typeof attachPeopleColdDiagnostic>;try{diagnostic=attachPeopleColdDiagnostic(scope,page,path);}catch{/* Passive attachment cannot replace the original navigation. */}try{await scope.client.trackProducer(() => page.goto(path).catch(error=>{try{if(diagnostic)scope.client.capturePeopleColdFailure(error,diagnostic.snapshot());}catch{/* Preserve the original navigation failure before the producer latch. */}throw error;}));diagnostic?.operation('title-visible');await expect(page.getByText(title, { exact: true }).first()).toBeVisible();diagnostic?.operation('overlay-clear');await expect(page.getByTestId('public-cold-entry-overlay')).toHaveCount(0); return page;}catch(error){try{if(diagnostic)scope.client.capturePeopleColdFailure(error,diagnostic.snapshot());}catch{/* Passive cold-entry evidence preserves the original failure. */}throw error;}finally{diagnostic?.detach();} }
export async function editable(scope: Scope, context: BrowserContext, kind: 'collections' | 'recommendations', id: string) { const value = (await scope.read(context, `/${kind}/${id}/editable?status=all`)).body; return kind === 'collections' ? editableOwnerCollectionSchema.parse(value.collection) : editableOwnerRecommendationSchema.parse(value.recommendation); }
export async function patch(scope: Scope, context: BrowserContext, kind: 'collections' | 'recommendations', id: string, changes: Record<string, unknown>) { const current = await editable(scope, context, kind, id); const data = (kind === 'collections' ? updateCollectionSchema : updateRecommendationSchema).parse({ expectedRevision: current.revision, ...changes }); return scope.client.trackProducer(async () => consume(await context.request.patch(`${BASE}/${kind}/${id}`, { headers: { Origin: scope.manifest.origin, 'Idempotency-Key': randomUUID() }, data, timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) }), 200)); }
export async function account(scope: Scope, context: BrowserContext, changes: Record<string, unknown>) { const current = accountDtoSchema.parse((await scope.read(context, '/me')).body.account); const data = updateAccountRequestSchema.parse({ expectedRevision: current.revision, ...changes }); return scope.client.trackProducer(async () => consume(await context.request.patch(`${BASE}/account`, { headers: { Origin: scope.manifest.origin, 'Idempotency-Key': randomUUID() }, data, timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) }), 200)); }
export async function invalidate(page: Page, scope: Scope, owner: 'ownerA' | 'ownerB', action: 'unpublish' | 'content-changed', id = randomUUID()) { await page.evaluate(event => { window.dispatchEvent(new CustomEvent('explorers-public-profile-invalidation', { detail: event })); const channel = new BroadcastChannel('explorers-public-profile-invalidation/v1'); channel.postMessage(event); channel.close(); }, { version: 'public-profile-invalidation/v1', eventId: id, accountDocumentId: scope.manifest.personas[owner].accountId, username: scope.manifest.personas[owner].handle, category: 'public_people', action, timestamp: Date.now() }); }
export function unavailableInput(info: TestInfo, key: 'games-manual-catalog-genre-unsupported' | 'people-configured-empty-positive-sector-unavailable') { info.annotations.push({ type: 'unavailable-input', description: key }); }
export function noPrivateData(value: unknown) {
    const forbidden = new Set(['cookie', 'session', 'token', 'password', 'email', 'userId', 'accountId']);
    function visit(row: unknown) {
        if (row && typeof row === 'object')
            for (const [key, child] of Object.entries(row)) {
                expect(forbidden.has(key)).toBe(false);
                visit(child);
            }
    }
    visit(value);
}
export async function binary(scope: Scope, context: BrowserContext, path: string, status: number, method: 'GET' | 'HEAD' = 'GET', headers: Record<string, string> = {}) {
    return scope.client.trackProducer(async () => {
        const reply = await context.request.fetch(path, { method, headers, timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) });
        try {
            expect(reply.status()).toBe(status);
            const bytes = await reply.body();
            expect(bytes.byteLength).toBeLessThanOrEqual(PUBLIC_PARITY_QUALIFICATION_POLICY.responseBytes);
            return { bytes, headers: reply.headers() };
        }
        finally {
            await reply.dispose();
        }
    });
}
export async function guideSections(scope: Scope, context: BrowserContext, slug: string, expected: string[]) {
    const ids: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
        const body: any = (await scope.read(context, `${categoryURL(scope.manifest.personas.ownerA.handle, 'guides')}/${slug}?limit=12${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)).body;
        expect(body.guides).toHaveLength(1);
        const guide: any = body.guides[0];
        expect(guide.guide_sections.map((row: any) => row.documentId)).toEqual(expected.slice(ids.length, ids.length + 12));
        ids.push(...guide.guide_sections.map((row: any) => row.documentId));
        cursor = guide.guide_sections_next_cursor;
        if (cursor === null) {
            expect(ids).toEqual(expected);
            return;
        }
        expect(cursor).toBe(`o${ids.length}`);
    }
    throw Error('PUBLIC_PARITY_GUIDE_CURSOR_UNSETTLED');
}
export async function browserAcknowledgement(scope: Scope, page: Page, path: string, method: string, status: number, action: () => Promise<unknown>) { const original = page.waitForResponse(reply => new URL(reply.url()).origin === scope.manifest.origin && new URL(reply.url()).pathname === BASE + path && reply.request().method() === method, { timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) }); const owned = scope.client.trackProducer(async () => { const reply = await original; expect(reply.status()).toBe(status); const bytes = await reply.body(); expect(bytes.byteLength).toBeLessThanOrEqual(PUBLIC_PARITY_QUALIFICATION_POLICY.responseBytes); expect(await reply.finished()).toBeNull(); return JSON.parse(bytes.toString('utf8')); }); void owned.catch(() => undefined); await scope.client.trackProducer(async () => { await action(); }); return owned; }
export function validateTraversalPage(expected: readonly string[], offset: number, actual: readonly string[], cursor: string | null, limit: 12 | 24, seen: Set<string>): number {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > expected.length || offset / limit >= 5 || JSON.stringify(actual) !== JSON.stringify(expected.slice(offset, offset + limit)) || new Set(actual).size !== actual.length)
        throw Error('PUBLIC_PARITY_NATIVE_ORDER_REFUSED');
    const next = offset + actual.length;
    if (cursor === null ? next !== expected.length : typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 2048 || seen.has(cursor) || actual.length !== limit || next >= expected.length)
        throw Error('PUBLIC_PARITY_NATIVE_CURSOR_REFUSED');
    if (cursor !== null)
        seen.add(cursor);
    return next;
}
export async function pin(scope: Scope, context: BrowserContext, category: 'people', listId: string, recommendationId: string) { const snapshot = ownerSnapshotSchema.parse((await scope.read(context, `/categories/${category}/content-snapshot`)).body); const data = categoryTopPicksInputSchema.parse({ expectedCategoryRevision: snapshot.revision, expectedPinRevision: snapshot.pinRevision, orderedPins: [{ collectionId: listId, recommendationId }] }); const reply = await scope.client.trackProducer(async () => consume(await context.request.put(`${BASE}/categories/${category}/top-picks`, { headers: { Origin: scope.manifest.origin, 'Idempotency-Key': randomUUID() }, data }), 200)); const actual = categoryTopPicksResultSchema.parse(reply.body.topPicks); expect(actual.pins).toEqual([{ collectionId: listId, recommendationId, position: 0 }]); return actual; }
export async function removeGuidePhoto(scope: Scope, context: BrowserContext, listId: string, sectionId: string, mediaId: string) {
    const current = guideAggregateDtoSchema.parse((await scope.read(context, `/collections/${listId}/guide`)).body.guide), section = current.sections.find(row => row.id === sectionId);
    expect(section).toBeDefined();
    const blocks = structuredClone(section!.blocks);
    for (const activity of [...blocks.timeline.morning, ...blocks.timeline.afternoon, ...blocks.timeline.evening])
        activity.photos = activity.photos.filter(photo => photo.mediaId !== mediaId);
    const data = writeGuideSectionSchema.parse({ revision: current.revision, title: section!.title, description: section!.description, blocks });
    return scope.client.trackProducer(async () => consume(await context.request.patch(`${BASE}/collections/${listId}/guide/sections/${sectionId}`, { headers: { Origin: scope.manifest.origin, 'Idempotency-Key': randomUUID() }, data }), 200));
}
export async function projectedPages(scope: Scope, context: BrowserContext, category: PublicParityIssuedManifest['categories'][number]['category'], expected: string[], limit: 12 | 24, slug?: string) {
    let cursor: string | null = null, offset = 0;
    const seen = new Set<string>();
    for (let page = 0; page < 5; page++) {
        const raw: any = (await scope.read(context, `${categoryURL(scope.manifest.personas.ownerA.handle, category)}${slug ? '/' + slug : ''}?limit=${limit}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)).body;
        let ids: string[], next: string | null;
        if (category === 'games') {
            const body = gamesPublicPageSchema.parse(raw);
            ids = slug ? body.gameLists[0].recommendations.map(row => row.id) : body.gameLists.map(row => row.id);
            next = slug ? body.gameLists[0].nextCursor : body.nextCursor;
        }
        else {
            const rows = readPublicPageRows(raw, category, Boolean(slug), category === 'guides' ? 12 : limit) as {
                documentId: string;
            }[];
            ids = rows.map(row => row.documentId);
            const fields = PUBLIC_PROFILE_PAGE_FIELDS[category];
            if (slug) {
                const parent = raw[fields.root][0];
                next = category === 'places' ? placePageCursor(raw) : parent[`${fields.child}_next_cursor`];
            }
            else
                next = category === 'movies' ? raw.nextCursor : ids.length === limit ? `o${offset + ids.length}` : null;
        }
        offset = validateTraversalPage(expected, offset, ids, next, limit, seen);
        if (next === null) {
            expect(offset).toBe(expected.length);
            return;
        }
        cursor = next;
    }
    throw Error('PUBLIC_PARITY_PROJECTED_CURSOR_UNSETTLED');
}
export async function movieGenrePages(scope: Scope, context: BrowserContext) {
    const movies = graph(scope, 'movies'), facet = movies.catalogFacet!;
    const expected = movies.items.filter(row => row.accountId === scope.manifest.personas.ownerA.accountId && row.control === null && !row.archived && row.publicationState === 'published' && movies.lists.some(parent => parent.id === row.collectionId && parent.visibility === 'public' && parent.publicationState === 'published' && !parent.archived)).map(row => row.id);
    let cursor: string | null = null, offset = 0;
    const seen = new Set<string>();
    for (let page = 0; page < 3; page++) {
        const body: any = (await scope.read(context, `${BASE}/profiles/${scope.manifest.personas.ownerA.handle}/recommendations/movies/genres/${facet.slug}?limit=24${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`)).body;
        expect(body.genre.slug).toBe(facet.slug);
        offset = validateTraversalPage(expected, offset, body.recommended_movies.map((row: any) => row.documentId), body.nextCursor, 24, seen);
        if (body.nextCursor === null) {
            expect(offset).toBe(expected.length);
            return;
        }
        cursor = body.nextCursor;
    }
    throw Error('PUBLIC_PARITY_GENRE_CURSOR_UNSETTLED');
}
export { PUBLIC_PARITY_QUALIFICATION_POLICY };
/** Qualification pacing only; production middleware and clocks stay unchanged. */
export async function rateWindow(scope: Scope, context: BrowserContext, windowMs: 65000) {
    if (windowMs !== PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs)
        throw Error('PUBLIC_PARITY_RATE_WINDOW_REFUSED');
    return scope.client.trackProducer(signal => new Promise<void>((resolve, reject) => {
        const started = performance.now();
        let timer: ReturnType<typeof setTimeout> | undefined, settled = false;
        const finish = (error?: Error) => {
            if (settled)
                return;
            settled = true;
            if (timer !== undefined)
                clearTimeout(timer);
            signal.removeEventListener('abort', aborted);
            context.off('close', closed);
            error ? reject(error) : resolve();
        };
        const aborted = () => finish(Error('PUBLIC_PARITY_RATE_WINDOW_ABORTED')), closed = () => finish(Error('PUBLIC_PARITY_RATE_WINDOW_CONTEXT_CLOSED'));
        const tick = () => {
            const remaining = windowMs - (performance.now() - started);
            if (remaining > 0)
                timer = setTimeout(tick, Math.ceil(remaining));
            else
                finish();
        };
        signal.addEventListener('abort', aborted, { once: true });
        context.on('close', closed);
        if (signal.aborted)
            aborted();
        else
            timer = setTimeout(tick, windowMs);
    }));
}
export function waitOwnedResponseGate(signal: AbortSignal, gate: Promise<void>, context: BrowserContext, budgetMs: number): Promise<void> {
    if (!Number.isSafeInteger(budgetMs) || budgetMs < 1 || budgetMs > PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs)
        throw Error('PUBLIC_PARITY_GATE_BUDGET_REFUSED');
    return new Promise((resolve, reject) => {
        let done = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error) => { if (done)
            return; done = true; clearTimeout(timer); signal.removeEventListener('abort', abort); context.off('close', close); error ? reject(error) : resolve(); };
        const abort = () => finish(Error('PUBLIC_PARITY_GATE_ABORTED')), close = () => finish(Error('PUBLIC_PARITY_GATE_CONTEXT_CLOSED'));
        timer = setTimeout(() => finish(Error('PUBLIC_PARITY_GATE_DEADLINE')), budgetMs);
        signal.addEventListener('abort', abort, { once: true });
        context.once('close', close);
        if (signal.aborted)
            abort();
        void gate.then(() => finish(), () => finish(Error('PUBLIC_PARITY_GATE_REFUSED')));
    });
}
function attachPublicOwnerReturnDiagnostic(scope:Scope,page:Page){if(scope.manifest.family!=='public-parity'||scope.manifest.caseId!==PUBLIC_PARITY_CASES[7]||!['public-parity-desktop','public-parity-mobile'].includes(scope.manifest.project)||scope.manifest.epoch!==(scope.manifest.project==='public-parity-desktop'?8:24))return;const origin=scope.manifest.origin,detailPaths=new Set(scope.manifest.categories.find(row=>row.category==='people')?.items.filter(row=>row.accountId===scope.manifest.personas.ownerA.accountId).map(row=>BASE+'/recommendations/'+row.id+'/editable'));let active=true;const value:{-readonly [K in keyof PublicOwnerReturn]:PublicOwnerReturn[K]}={operation:'navigation',snapshotSeen:0,snapshotStatus:null,validationSeen:0,validationStatus:null,collectionsSeen:0,collectionsStatus:null,recommendationsSeen:0,recommendationsStatus:null,membershipsSeen:0,membershipsStatus:null,detailsSeen:0,detailsStatus:null,pageErrors:0,overflow:false,loadingCount:null,refusalCount:null,targetCount:null};const response=(reply:Response)=>{if(!active)return;try{if(reply.request().method()!=='GET')return;const url=new URL(reply.url());if(url.origin!==origin)return;const path=url.pathname,key=path===BASE+'/categories/people/content-snapshot'?'snapshot':path===BASE+'/categories/people/content-snapshot/validate'?'validation':path===BASE+'/collections'&&url.searchParams.get('category')==='people'?'collections':path===BASE+'/recommendations'&&url.searchParams.get('category')==='people'?'recommendations':path===BASE+'/categories/people/memberships'?'memberships':detailPaths.has(path)?'details':undefined;if(!key)return;const seen=(key+'Seen') as 'snapshotSeen',status=(key+'Status') as 'snapshotStatus';if(value[seen]<64)value[seen]++;else value.overflow=true;value[status]=null;const observed=reply.status();if(Number.isSafeInteger(observed)&&observed>=100&&observed<=599)value[status]=observed;else value.overflow=true;}catch{value.overflow=true;}};const pageError=(error:unknown)=>{if(!active)return;const first=value.pageErrors===0;if(value.pageErrors<64)value.pageErrors++;else value.overflow=true;if(first){const frame=firstPeopleServedModuleFrame(error,origin);if(frame)value.firstPageErrorFrame=frame;}};const detach=()=>{if(!active)return;active=false;try{page.off('response',response);}catch{value.overflow=true;}try{page.off('pageerror',pageError);}catch{value.overflow=true;}};try{page.on('response',response);page.on('pageerror',pageError);}catch{value.overflow=true;detach();}return Object.freeze({operation(operation:PublicOwnerReturn['operation']){value.operation=operation;},async failureSnapshot(title:string){for(const [key,locator] of [['loadingCount',()=>page.locator('.skeleton-card')],['refusalCount',()=>page.getByRole('alert')],['targetCount',()=>page.getByText(title,{exact:true})]] as const){try{const count=await locator().count();if(Number.isSafeInteger(count)&&count>=0&&count<=64)value[key]=count;else value.overflow=true;}catch{value.overflow=true;}}return Object.freeze({...value});},detach});}
export async function finalPeopleOwnerReturn(scope:Scope,page:Page,title:string){let diagnostic:ReturnType<typeof attachPublicOwnerReturnDiagnostic>,captured=false;try{diagnostic=attachPublicOwnerReturnDiagnostic(scope,page);}catch{/* Passive witness cannot replace navigation. */}try{await scope.client.trackProducer(()=>page.goto('/recommendations/people').catch(async error=>{try{if(diagnostic)scope.client.capturePublicReturnFailure(error,await diagnostic.failureSnapshot(title));}catch{/* Preserve original error before producer latch. */}captured=true;throw error;}));diagnostic?.operation('title-visible');await expect(page.getByText(title,{exact:true}).first()).toBeVisible();}catch(error){try{if(diagnostic&&!captured)scope.client.capturePublicReturnFailure(error,await diagnostic.failureSnapshot(title));}catch{/* Preserve original assertion. */}throw error;}finally{diagnostic?.detach();}}

const publicNavigationTimeoutPrototype=errors.TimeoutError.prototype;
function publicNavigationErrorKind(error:unknown):'timeout'|'other'|undefined{if(typeof error!=='object'||error===null||isProxy(error)||!isNativeError(error))return;return Object.getPrototypeOf(error)===publicNavigationTimeoutPrototype?'timeout':'other';}
function attachPublicNavigationDiagnostic(scope:Scope,page:Page){if(scope.manifest.family!=='public-parity'||scope.manifest.caseId!==PUBLIC_PARITY_CASES[10]||!['public-parity-desktop','public-parity-mobile'].includes(scope.manifest.project)||scope.manifest.epoch!==(scope.manifest.project==='public-parity-desktop'?11:27))return;const origin=scope.manifest.origin,final=`pp-${scope.manifest.runId.slice(0,10)}-end`,path=`/${final}/people/${target(scope,'people').slug}`,shell=BASE+'/profiles/'+final,detail=shell+'/recommendations/people/'+target(scope,'people').slug;let active=true;const value:{-readonly [K in keyof PublicNavigation]:PublicNavigation[K]}={operation:'final-goto',documentSeen:0,documentStatus:null,shellSeen:0,shellStatus:null,detailSeen:0,detailStatus:null,pageErrors:0,overflow:false};const response=(reply:Response)=>{if(!active)return;try{if(reply.request().method()!=='GET')return;const url=new URL(reply.url());if(url.origin!==origin)return;const key=url.pathname===path?'document':url.pathname===shell?'shell':url.pathname===detail?'detail':undefined;if(!key)return;const seen=(key+'Seen') as 'documentSeen',status=(key+'Status') as 'documentStatus';if(value[seen]<64)value[seen]++;else value.overflow=true;value[status]=null;const observed=reply.status();if(Number.isSafeInteger(observed)&&observed>=100&&observed<=599)value[status]=observed;else value.overflow=true;}catch{value.overflow=true;}};const pageError=(error:unknown)=>{if(!active)return;const first=value.pageErrors===0;if(value.pageErrors<64)value.pageErrors++;else value.overflow=true;if(first){const frame=firstPeopleServedModuleFrame(error,origin);if(frame)value.firstPageErrorFrame=frame;}};const detach=()=>{if(!active)return;active=false;try{page.off('response',response);}catch{value.overflow=true;}try{page.off('pageerror',pageError);}catch{value.overflow=true;}};try{page.on('response',response);page.on('pageerror',pageError);}catch{value.overflow=true;detach();}return Object.freeze({snapshot:(error:unknown)=>{const navigationError=publicNavigationErrorKind(error);return Object.freeze({...value,...(navigationError?{navigationError}:{})});},detach});}
export async function finalPublicUsernameNavigation(scope:Scope,page:Page,final:string,slug:string){let diagnostic:ReturnType<typeof attachPublicNavigationDiagnostic>;try{diagnostic=attachPublicNavigationDiagnostic(scope,page);}catch{/* Passive witness cannot replace navigation. */}try{await scope.client.trackProducer(()=>page.goto(`/${final}/people/${slug}`).catch(error=>{try{if(diagnostic)scope.client.capturePublicNavigationFailure(error,diagnostic.snapshot(error));}catch{/* Preserve original error before producer latch. */}throw error;}));}finally{diagnostic?.detach();}}
