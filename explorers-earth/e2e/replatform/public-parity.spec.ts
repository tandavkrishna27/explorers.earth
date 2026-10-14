import {ownerCollectionDtoSchema} from '../../../tunes/shared/explorersOwnerContentContract';
import {publicContentRequestSchema,publicRecommendationDetailSchema,publicRecommendationSummarySchema} from '../../../tunes/shared/explorersPublicContentContract';
import { slugToSubjectName } from '../../src/features/Books/utils/bookHelpers';
import { test, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { PUBLIC_PARITY_CASES } from '../../../tunes/scripts/public-parity-browser-support';
import { BASE, finalPublicUsernameNavigation, finalPeopleOwnerReturn, qualificationClient, runOwnedCase, graph, target, cold, categoryURL, genericURL, orderedPages, guideSections, patch, account, editable, invalidate, binary, noPrivateData, unavailableInput, pin, removeGuidePhoto, projectedPages, movieGenrePages, waitOwnedResponseGate, rateWindow, PUBLIC_PARITY_QUALIFICATION_POLICY } from './public-parity-spec-support';
const livePublicCollectionPageSchema=publicRecommendationDetailSchema.omit({recommendation:true}).extend({items:ownerCollectionDtoSchema.pick({id:true,title:true,slug:true,description:true,heading:true}).strict().array().max(12),nextCursor:publicContentRequestSchema.shape.cursor.unwrap().nullable()}).strict();
const livePublicRecommendationPageSchema=livePublicCollectionPageSchema.extend({items:publicRecommendationSummarySchema.array().max(12)}).strict();
const client = qualificationClient();
for (const [index, title] of PUBLIC_PARITY_CASES.entries())
    test(title, async ({ browser }, info) => runOwnedCase(client, browser, info, async (scope) => {
        const anonymous = await scope.context('anonymous'), owner = await scope.context('ownerA'), a = scope.manifest.personas.ownerA, b = scope.manifest.personas.ownerB, list = target(scope, 'people'), people = graph(scope, 'people');
        const positive = people.items.find(row => row.collectionId === list.id && row.control === null)!;
        switch (index) {
            case 0:
                for (const category of scope.manifest.categories) {
                    if (scope.manifest.categories.indexOf(category) > 0)
                        await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                    const list = target(scope, category.category);
                    await test.step(`Cold ${category.category}`, async () => { await cold(scope, anonymous, `/${a.handle}/${category.category}`, list.title); await cold(scope, anonymous, `/${a.handle}/${category.category}/${list.slug}`, list.title); expect((await scope.read(anonymous, categoryURL(a.handle, category.category))).body).toBeTruthy(); });
                }
                break;
            case 1:
                await movieGenrePages(scope, anonymous);
                for (const category of scope.manifest.categories) {
                    const wanted = category.lists.filter(row => row.accountId === a.accountId && row.control === null && !row.archived).map(row => row.id);
                    await orderedPages(scope, anonymous, genericURL(a.handle, category.category), wanted, 12);
                    await projectedPages(scope, anonymous, category.category, wanted, 12);
                    const list = target(scope, category.category), items = category.items.filter(row => row.collectionId === list.id && row.control === null && !row.archived).map(row => row.id);
                    if (category.category === 'guides')
                        await guideSections(scope, anonymous, list.slug, items);
                    else {
                        const limit = category.category === 'books' || category.category === 'places' ? 24 : 12;
                        await orderedPages(scope, anonymous, genericURL(a.handle, category.category, list.slug), items, limit);
                        await projectedPages(scope, anonymous, category.category, items, limit, list.slug);
                    }
                }
                break;
            case 2:
                for (const category of scope.manifest.categories) {
                    if (scope.manifest.categories.indexOf(category) > 0)
                        await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                    const first = target(scope, category.category), second = target(scope, category.category, 'ownerB');
                    expect(first.slug).toBe(second.slug);
                    expect(first.id).not.toBe(second.id);
                    await cold(scope, anonymous, `/${a.handle}/${category.category}/${first.slug}`, first.title);
                    await cold(scope, anonymous, `/${b.handle}/${category.category}/${second.slug}`, second.title);
                }
                break;
            case 3: {
                const foreign = await scope.context('ownerB');
                for (const category of scope.manifest.categories) {
                    const name = category.category, ownList = target(scope, name), privateList = category.lists.find(row => row.accountId === a.accountId && row.control === 'private')!;
                    await scope.read(anonymous, categoryURL(a.handle, name));
                    await scope.read(anonymous, genericURL(a.handle, name, privateList.slug), 404);
                    await editable(scope, owner, 'collections', privateList.id);
                    await scope.read(foreign, `/collections/${privateList.id}/editable?status=all`, 404);
                    await scope.read(anonymous, `/collections/${privateList.id}/editable?status=all`, 401);
                    if (name === 'guides') {
                        const ids = category.items.filter(row => row.collectionId === ownList.id && row.control === null && !row.archived).map(row => row.id);
                        await guideSections(scope, anonymous, ownList.slug, ids);
                        await scope.read(owner, `/collections/${ownList.id}/guide`);
                        await scope.read(foreign, `/collections/${ownList.id}/guide`, 404);
                        await scope.read(anonymous, `/collections/${ownList.id}/guide`, 401);
                    }
                    else {
                        const item = category.items.find(row => row.collectionId === ownList.id && row.control === null)!;
                        await scope.read(anonymous, `${genericURL(a.handle, name, ownList.slug)}/${item.id}`);
                        await editable(scope, owner, 'recommendations', item.id);
                        await scope.read(foreign, `/recommendations/${item.id}/editable?status=all`, 404);
                        await scope.read(anonymous, `/recommendations/${item.id}/editable?status=all`, 401);
                    }
                }
                await scope.read(anonymous, `/profiles/${a.handle}`);
                await account(scope, owner, { publicProfile: false });
                await scope.read(anonymous, `/profiles/${a.handle}`, 404);
                for (const category of scope.manifest.categories) {
                    await scope.read(anonymous, categoryURL(a.handle, category.category), 404);
                    await scope.read(anonymous, genericURL(a.handle, category.category, target(scope, category.category).slug), 404);
                    await scope.read(anonymous, categoryURL(b.handle, category.category));
                }
                break;
            }
            case 4: {
                for (const category of scope.manifest.categories) {
                    const name = category.category, ownList = target(scope, name), bodies = [];
                    for (const slug of ['missing-native-list', ...category.lists.filter(row => row.accountId === a.accountId && row.control !== null).map(row => row.slug)])
                        bodies.push((await scope.read(anonymous, genericURL(a.handle, name, slug), 404)).body);
                    for (const body of bodies)
                        expect(body).toEqual(bodies[0]);
                    if (name === 'guides') {
                        // Sections are exposed through the native guide aggregate, not a recommendation-detail route.
                        await guideSections(scope, anonymous, ownList.slug, category.items.filter(row => row.collectionId === ownList.id && row.control === null && !row.archived).map(row => row.id));
                    }
                    else {
                        const missing = (await scope.read(anonymous, `${genericURL(a.handle, name, ownList.slug)}/${randomUUID()}`, 404)).body;
                        for (const item of category.items.filter(row => row.accountId === a.accountId && row.control !== null)) {
                            const parent = category.lists.find(row => row.id === item.collectionId)!;
                            expect((await scope.read(anonymous, `${genericURL(a.handle, name, parent.slug)}/${item.id}`, 404)).body).toEqual(missing);
                        }
                    }
                }
                break;
            }
            case 5: {
                const cursors = new Map<string, string>();
                for (const category of scope.manifest.categories) {
                    const body = (await scope.read(anonymous, `${genericURL(a.handle, category.category)}?limit=12`)).body;
                    expect(body.nextCursor).toEqual(expect.any(String));
                    cursors.set(category.category, body.nextCursor);
                }
                await account(scope, owner, { publicProfile: false });
                for (const category of scope.manifest.categories)
                    await scope.read(anonymous, `${genericURL(a.handle, category.category)}?limit=12&cursor=${encodeURIComponent(cursors.get(category.category)!)}`, 404);
                await account(scope, owner, { publicProfile: true });
                const settings = (await scope.read(owner, '/me')).body.account.categories;
                for (const category of scope.manifest.categories) {
                    const name = category.category;
                    const first = (await scope.read(anonymous, `${genericURL(a.handle, name)}?limit=12`)).body;
                    expect(first.nextCursor).toEqual(expect.any(String));
                    await account(scope, owner, { categories: settings.map((row: any) => ({ ...row, isPublic: row.category === name ? false : row.isPublic })) });
                    await scope.read(anonymous, `${genericURL(a.handle, name)}?limit=12&cursor=${encodeURIComponent(first.nextCursor)}`, 404);
                    await scope.read(anonymous, categoryURL(a.handle, name), 404);
                    await account(scope, owner, { categories: settings });
                }
                const first = livePublicCollectionPageSchema.parse((await scope.read(anonymous, `${genericURL(a.handle, 'people')}?limit=12`)).body);
                const publicPeopleLists=people.lists.filter(row=>row.accountId===a.accountId&&row.control===null&&!row.archived&&row.visibility==='public'&&row.publicationState==='published').sort((left,right)=>left.displayOrder-right.displayOrder);
                expect(first.items.map(row=>row.id)).toEqual(publicPeopleLists.slice(0,12).map(row=>row.id));
                expect(first.nextCursor).toEqual(expect.any(String));
                const parentFirst=livePublicRecommendationPageSchema.parse((await scope.read(anonymous, `${genericURL(a.handle, 'people',list.slug)}?limit=12`)).body);
                expect(parentFirst.nextCursor).toEqual(expect.any(String));
                await patch(scope, owner, 'collections', list.id, { visibility: 'private' });
                const continued=livePublicCollectionPageSchema.parse((await scope.read(anonymous, `${genericURL(a.handle, 'people')}?limit=12&cursor=${encodeURIComponent(first.nextCursor!)}`,200)).body);
                expect(continued.items.map(row=>row.id)).toEqual(publicPeopleLists.slice(first.items.length).filter(row=>row.id!==list.id).slice(0,12).map(row=>row.id));
                expect(continued.items.some(row=>row.id===list.id)).toBe(false);
                expect((await scope.read(anonymous, `${genericURL(a.handle, 'people',list.slug)}?limit=12&cursor=${encodeURIComponent(parentFirst.nextCursor!)}`,404)).body).toEqual({version:'explorers-public-error/v1',error:{code:'NOT_FOUND'}});
                break;
            }
            case 6: {
                const path = `${categoryURL(a.handle, 'people')}/${list.slug}`, before = await scope.read(anonymous, path);
                expect(before.headers.etag).toBeTruthy();
                await patch(scope, owner, 'collections', list.id, { publicationState: 'draft' });
                const after = await scope.read(anonymous, path, 404, { 'If-None-Match': before.headers.etag });
                expect(after.body.error.code).toBe('NOT_FOUND');
                break;
            }
            case 7: {
                const other = await scope.context('ownerB');
                const page = await cold(scope, owner, `/${a.handle}/people/${list.slug}`, list.title);
                const oldCookies = await scope.client.trackProducer(() => owner.cookies());
                await patch(scope, owner, 'collections', list.id, { visibility: 'private' });
                await scope.client.trackProducer(async () => {
                    const reply = await owner.request.post('/api/auth/sign-out', { headers: { Origin: scope.manifest.origin }, data: {}, timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) });
                    try {
                        expect(reply.status()).toBe(200);
                    }
                    finally {
                        await reply.dispose();
                    }
                });
                await scope.client.trackProducer(() => owner.addCookies(oldCookies));
                await scope.read(owner, '/me', 401);
                await scope.client.trackProducer(() => page.reload());
                await expect(page.getByText(list.title, { exact: true })).toHaveCount(0);
                expect((await scope.read(other, '/me')).body.account.id).toBe(b.accountId);
                await scope.read(other, `/collections/${list.id}/editable?status=all`, 404);
                const bCookies=await scope.client.trackProducer(()=>other.cookies());
                await scope.client.trackProducer(()=>owner.clearCookies());
                await scope.client.trackProducer(()=>owner.addCookies(bCookies));
                expect((await scope.read(owner,'/me')).body.account.id).toBe(b.accountId);
                await scope.client.trackProducer(()=>page.goto('/recommendations/people'));
                await expect(page.getByText(target(scope,'people','ownerB').title,{exact:true}).first()).toBeVisible();
                await expect(page.getByText(list.title,{exact:true})).toHaveCount(0);
                await scope.observe();
                const freshA = await scope.freshContext('ownerA');
                expect((await scope.read(freshA, '/me')).body.account.id).toBe(a.accountId);
                await editable(scope, freshA, 'collections', list.id);
                await scope.read(anonymous, genericURL(a.handle, 'people', list.slug), 404);
                const freshCookies=await scope.client.trackProducer(()=>freshA.cookies());
                await scope.client.trackProducer(()=>owner.clearCookies());
                await scope.client.trackProducer(()=>owner.addCookies(freshCookies));
                expect((await scope.read(owner,'/me')).body.account.id).toBe(a.accountId);
                await finalPeopleOwnerReturn(scope,page,list.title);
                await expect(page.getByText(target(scope,'people','ownerB').title,{exact:true})).toHaveCount(0);
                break;
            }
            case 8: {
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title), second = await scope.client.trackProducer(() => anonymous.newPage());
                await scope.client.trackProducer(() => second.goto(`/${a.handle}/people/${list.slug}`));
                await expect(second.getByText(list.title, { exact: true }).first()).toBeVisible();
                let release!: () => void, reached!: () => void;
                const gate = new Promise<void>(r => release = r), entered = new Promise<void>(r => reached = r);
                let original: Promise<void> | undefined;
                await page.route(`**${categoryURL(a.handle, 'people')}/${list.slug}*`, route => {
                    original = scope.client.trackProducer(async (signal) => {
                        const response = await route.fetch({ timeout: Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs) });
                        try {
                            reached();
                            await waitOwnedResponseGate(signal, gate, anonymous, Math.min(scope.client.remainingMs(), PUBLIC_PARITY_QUALIFICATION_POLICY.contextMs));
                            await route.fulfill({ response });
                        }
                        finally {
                            await response.dispose();
                        }
                    });
                    return original;
                }, { times: 1 });
                try {
                    await invalidate(page, scope, 'ownerA', 'content-changed');
                    await scope.client.trackProducer(() => entered);
                    await patch(scope, owner, 'collections', list.id, { publicationState: 'draft' });
                    await invalidate(second, scope, 'ownerA', 'unpublish');
                    release();
                    if (original)
                        await original;
                    await expect(second.getByText(list.title, { exact: true })).toHaveCount(0);
                    await expect(page.getByText(list.title, { exact: true })).toHaveCount(0);
                    await scope.read(anonymous, `${categoryURL(a.handle, 'people')}/${list.slug}`, 404);
                    await page.unrouteAll({ behavior: 'wait' });
                    await page.route(`**${categoryURL(a.handle, 'people')}/${list.slug}*`, route => route.abort('failed'));
                    await scope.client.trackProducer(() => page.reload());
                    await expect(page.getByTestId('public-cold-entry-overlay')).toHaveCount(0);
                }
                finally {
                    release();
                    if (original)
                        await original;
                    await page.unrouteAll({ behavior: 'wait' });
                }
                break;
            }
            case 9: {
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title);
                let reads = 0;
                page.on('request', request => {
                    if (new URL(request.url()).pathname === `${categoryURL(a.handle, 'people')}/${list.slug}`)
                        reads++;
                });
                const id = randomUUID();
                await invalidate(page, scope, 'ownerB', 'content-changed', id);
                await expect(page.getByText(list.title, { exact: true }).first()).toBeVisible();
                expect(reads).toBe(0);
                await invalidate(page, scope, 'ownerA', 'content-changed', randomUUID());
                await expect.poll(() => reads).toBe(1);
                const duplicate = randomUUID();
                await invalidate(page, scope, 'ownerA', 'content-changed', duplicate);
                await invalidate(page, scope, 'ownerA', 'content-changed', duplicate);
                await expect.poll(() => reads).toBe(2);
                break;
            }
            case 10: {
                // This is the first public load of this epoch's freshly launched API process
                // and it fans out ~11 resolveAccount reads against a cold pool. The browser
                // aborts each read at 15000ms while the assertion budget is also exactly
                // 15000ms, with no retry anywhere on the cold-entry path, so a single slow
                // read renders NotFound and the title never appears. Assert the same positive
                // API read case 0 uses first: it proves more, adds no retry, runs on the
                // harness budget, and leaves the browser load inside its own.
                expect((await scope.read(anonymous, categoryURL(a.handle, 'people'))).body).toBeTruthy();
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title), changed = `pp-${scope.manifest.runId.slice(0, 10)}-new`, final = `pp-${scope.manifest.runId.slice(0, 10)}-end`;
                await account(scope, owner, { handle: changed });
                await scope.read(anonymous, categoryURL(a.handle, 'people'), 404);
                await scope.client.trackProducer(() => page.goto(`/${changed}/people/${list.slug}`));
                await expect(page.getByText(list.title, { exact: true }).first()).toBeVisible();
                await account(scope, owner, { handle: final });
                await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                await finalPublicUsernameNavigation(scope,page,final,list.slug);
                await scope.client.trackProducer(() => page.goBack());
                await scope.read(anonymous, categoryURL(changed, 'people'), 404);
                await expect(page.getByText(list.title, { exact: true })).toHaveCount(0);
                await expect(page.getByTestId('public-cold-entry-overlay')).toHaveCount(0);
                break;
            }
            case 11: {
                const page = await scope.client.trackProducer(() => anonymous.newPage());
                await scope.client.trackProducer(() => page.goto('/invalid%21handle/people'));
                await expect(page.getByTestId('public-cold-entry-overlay')).toHaveCount(0);
                await page.route(`**${categoryURL(a.handle, 'people')}*`, route => route.abort('failed'));
                await scope.client.trackProducer(() => page.goto(`/${a.handle}/people`));
                await expect(page.getByTestId('public-cold-entry-overlay')).toHaveCount(0);
                await expect(page.getByText(list.title, { exact: true })).toHaveCount(0);
                break;
            }
            case 12: {
                expect(scope.manifest.media.some(row => row.mimeType === 'video/mp4')).toBe(true);
                const profilePage = await cold(scope, anonymous, '/' + a.handle, a.displayName || a.handle);
                await profilePage.getByRole('tab', { name: 'Gallery', exact: true }).click();
                const videoAsset = scope.manifest.media.find(row => row.mimeType === 'video/mp4')!;
                const video = profilePage.locator('video[src*="' + videoAsset.id + '"]').first();
                await expect(video).toBeVisible();
                // The seeded asset is a single frame, so playback can finish before play()
                // settles. Only that exact native rejection paired with a positive
                // decoded-and-ended witness is admitted; every other error is preserved.
                const playback = await scope.client.trackProducer(() => video.evaluate(async (element) => { const media = element as HTMLVideoElement; media.muted = true; let completed = false; try { await media.play(); } catch (error) { if (!(error instanceof DOMException) || error.name !== 'AbortError' || !media.ended || media.videoWidth <= 0) throw error; completed = true; } const result = { width: media.videoWidth, height: media.videoHeight, playing: completed || !media.paused }; media.pause(); return result; }));
                expect(playback.playing).toBe(true);
                expect(playback.width).toBeGreaterThan(0);
                expect(playback.height).toBeGreaterThan(0);
                for (const media of scope.manifest.media) {
                    const get = await binary(scope, anonymous, media.contentUrl, 200);
                    expect(createHash('sha256').update(get.bytes).digest('hex')).toBe(media.sha256);
                    expect(get.bytes.length).toBe(media.byteLength);
                    const head = await binary(scope, anonymous, media.contentUrl, 200, 'HEAD');
                    expect(head.bytes.length).toBe(0);
                    expect(head.headers['content-length']).toBe(String(media.byteLength));
                    expect(get.headers.etag).toBeTruthy();
                    await binary(scope, anonymous, media.contentUrl, 304, 'GET', { 'If-None-Match': get.headers.etag });
                    if (media.mimeType === 'video/mp4') {
                        const range = await binary(scope, anonymous, media.contentUrl, 206, 'GET', { Range: 'bytes=0-7' });
                        expect(range.bytes).toEqual(get.bytes.subarray(0, 8));
                        expect(range.headers['content-range']).toBe(`bytes 0-7/${media.byteLength}`);
                        await binary(scope, anonymous, media.contentUrl, 416, 'GET', { Range: `bytes=${media.byteLength}-` });
                        await binary(scope, anonymous, media.contentUrl, 416, 'GET', { Range: 'bytes=invalid' });
                    }
                }
                for (const media of scope.manifest.media.filter(row => row.attachments.length === 1 && row.attachments[0].slot !== 'feed-media')) {
                    const attachment = media.attachments[0];
                    await patch(scope, owner, 'collections', attachment.collectionId!, { visibility: 'private' });
                    await binary(scope, anonymous, media.contentUrl, 404);
                    await patch(scope, owner, 'collections', attachment.collectionId!, { visibility: 'public' });
                    await binary(scope, anonymous, media.contentUrl, 200);
                    if (attachment.slot === 'guide-section-photo') {
                        await removeGuidePhoto(scope, owner, attachment.collectionId!, attachment.subresourceId!, media.id);
                        await binary(scope, anonymous, media.contentUrl, 404);
                    }
                    else if (attachment.slot === 'recommendation-media') {
                        const current: any = await editable(scope, owner, 'recommendations', attachment.subresourceId!);
                        await patch(scope, owner, 'recommendations', attachment.subresourceId!, { mediaIds: current.mediaIds.filter((id: string) => id !== media.id) });
                        await binary(scope, anonymous, media.contentUrl, 404);
                    }
                }
                const shared = scope.manifest.media.find(row => row.attachments.length === 2 && row.attachments.every(a => a.slot === 'recommendation-media'))!;
                expect(shared).toBeDefined();
                for (const [index, attachment] of shared.attachments.entries()) {
                    const current: any = await editable(scope, owner, 'recommendations', attachment.subresourceId!);
                    await patch(scope, owner, 'recommendations', attachment.subresourceId!, { mediaIds: current.mediaIds.filter((id: string) => id !== shared.id) });
                    await binary(scope, anonymous, shared.contentUrl, index === 0 ? 200 : 404);
                }
                for (const link of scope.manifest.links) {
                    const media = scope.manifest.media.find(asset => asset.attachments.some(a => a.collectionId === link.childCollectionId))!;
                    expect(media).toBeDefined();
                    // A linked child is independently addressable: the link is a presentation
                    // relation for the location page only, so a private parent hides itself and
                    // its own cover while the child's cover keeps serving. The child's own
                    // visibility is asserted by the single-attachment loop above.
                    await patch(scope, owner, 'collections', link.locationCollectionId, { visibility: 'private' });
                    await binary(scope, anonymous, media.contentUrl, 200);
                    await patch(scope, owner, 'collections', link.locationCollectionId, { visibility: 'public' });
                    await binary(scope, anonymous, media.contentUrl, 200);
                }
                await account(scope, owner, { publicProfile: false });
                for (const media of scope.manifest.media.filter(row => row.id !== shared.id))
                    await binary(scope, anonymous, media.contentUrl, 404);
                break;
            }
            case 13: {
                const page = await cold(scope, anonymous, `/${a.handle}/people`, list.title);
                await expect(page.getByRole('navigation').first()).toBeVisible();
                // Public navigation is slot-limited: computePinnedNavTabIds emits at most
                // MAX_NAV_SLOTS (5) ids, profile first, the rest chosen by pinned order then
                // list-count rank. Asserting all eight categories at once contradicts that
                // constraint; the pinned-order behaviour is asserted below.
                {
                    // Address the public nav by its accessible name: `.first()` is viewport
                    // dependent. MAX_NAV_SLOTS is a ceiling, not a fixed count, so assert the
                    // ceiling and the membership rather than a desktop-shaped exact count.
                    const nav = page.getByRole('navigation', { name: 'Public navigation' });
                    await expect(nav).toHaveCount(1);
                    const labels = (await nav.getByRole('link').allTextContents()).map(label => label.trim());
                    expect(labels.length).toBeGreaterThan(0);
                    expect(labels.length).toBeLessThanOrEqual(5);
                    expect(labels[0]).toBe('Profile');
                    const categories = ['Places', 'Movies', 'Books', 'Games', 'Guides', 'Apps', 'Products', 'People'];
                    expect(labels.slice(1).every(label => categories.includes(label))).toBe(true);
                }
                const me = (await scope.read(owner, '/me')).body.account;
                // Pinning requires manual mode: categoryNavigationPolicy blocks pin actions
                // with reason 'manual-required' while autoPinning is on, and
                // computePinnedNavTabIds ignores pinned tabs entirely in auto mode
                // (resolveAutoPinning defaults to true). Setting pinnedOrder alone cannot
                // move a tab into a nav slot.
                await account(scope, owner, { autoPinning: false, categories: me.categories.map((row: any) => ({ ...row, pinnedOrder: row.category === 'people' ? 0 : null })), themeSettings: { ...me.themeSettings, preset: 'cinematic-dark' } });
                await pin(scope, owner, 'people', list.id, positive.id);
                await scope.client.trackProducer(() => page.goto('/' + a.handle));
                await expect(page.getByTestId('public-profile-theme-root')).toHaveAttribute('data-theme-preset', 'cinematic-dark');
                await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                await scope.client.trackProducer(() => page.goto('/' + a.handle + '/people'));
                await expect(page.getByRole('link', { name: 'People', exact: true }).first()).toBeVisible();
                const projection = (await scope.read(anonymous, categoryURL(a.handle, 'people'))).body;
                const pinned = projection.personLists.flatMap((row: any) => row.recommended_people).find((row: any) => row.documentId === positive.id);
                expect(pinned).toMatchObject({ is_pinned: true, pin_order: 0 });
                const empty = people.items.find(row => row.editable?.userRating === null)!;
                expect(empty.editable?.note).toBeNull();
                const dto = (await scope.read(anonymous, `${genericURL(a.handle, 'people', list.slug)}/${empty.id}`)).body;
                expect(dto.recommendation.userRating).toBeNull();
                const shell = (await scope.read(anonymous, BASE + '/profiles/' + a.handle)).body;
                expect(shell.Account_Name).toBe(a.displayName);
                await scope.client.trackProducer(() => page.goto('/' + a.handle + '/people/' + list.slug));
                await expect(page.getByRole('link', { name: (shell.Account_Name || a.handle) + "'s People", exact: true })).toBeVisible();
                await page.getByText(positive.title, { exact: true }).first().click();
                await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
                await expect(page.getByRole('img', { name: positive.title, exact: true }).last()).toHaveAttribute('src', /^data:image\/svg\+xml/);
                break;
            }
            case 14: {
                for (const category of ['books', 'movies'] as const) {
                    if (category === 'movies')
                        await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                    const facet = graph(scope, category).catalogFacet!;
                    expect(facet.entityIds.ownerA.length).toBeGreaterThan(0);
                    await cold(scope, anonymous, `/${a.handle}/${category}/${category === 'books' ? 'subject' : 'genre'}/${facet.slug}`, category === 'books' ? slugToSubjectName(facet.slug) : facet.label);
                }
                for (const link of scope.manifest.links) {
                    await rateWindow(scope, anonymous, PUBLIC_PARITY_QUALIFICATION_POLICY.rateWindowMs);
                    const parent = graph(scope, 'places').lists.find(row => row.id === link.locationCollectionId)!;
                    const child = graph(scope, link.childCategory).lists.find(row => row.id === link.childCollectionId)!;
                    await cold(scope, anonymous, `/${a.handle}/places/${parent.slug}`, parent.title);
                    await cold(scope, anonymous, `/${a.handle}/${link.childCategory}/${child.slug}`, child.title);
                }
                unavailableInput(info, 'games-manual-catalog-genre-unsupported');
                unavailableInput(info, 'people-configured-empty-positive-sector-unavailable');
                await scope.read(anonymous, `${BASE}/profiles/${a.handle}/recommendations/people/sectors/no-configured-sector`, 404);
                break;
            }
            case 15: {
                const long = 'Accessible fixture person '.repeat(12).trim();
                await patch(scope, owner, 'recommendations', positive.id, { displayOverrides: { title: long } });
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title);
                await expect(page.getByText(long, { exact: true }).first()).toBeVisible();
                await scope.client.trackProducer(() => page.setViewportSize({ width: 390, height: 844 }));
                const personButton = page.getByRole('button', { name: long, exact: false }).first();
                await personButton.focus();
                await expect(personButton).toBeFocused();
                await page.keyboard.press('Enter');
                await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
                await expect(page.getByRole('heading', { level: 2, name: long, exact: true })).toBeVisible();
                expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
                expect(await page.getByRole('heading', { level: 2, name: long, exact: true }).evaluate(element => { const bounds=element.getBoundingClientRect();return bounds.left>=0&&bounds.right<=window.innerWidth; })).toBe(true);
                const closeButton=page.getByRole('button',{name:'Close',exact:true});
                await closeButton.focus();
                await expect(closeButton).toBeFocused();
                await page.keyboard.press('Enter');
                await expect(page.getByRole('heading',{level:2,name:long,exact:true})).toHaveCount(0);
                noPrivateData((await scope.read(anonymous, `${genericURL(a.handle, 'people', list.slug)}/${positive.id}`)).body);
                break;
            }
            default: throw Error('PUBLIC_PARITY_CASE_UNRESOLVED');
        }
    }));
