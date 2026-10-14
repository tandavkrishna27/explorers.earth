import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {z} from 'zod/v3';
import {apiErrorSchema} from '../../../tunes/shared/explorersContract';
import { PEOPLE_CASES } from '../../../tunes/scripts/public-parity-browser-support';
import { BASE, qualificationClient, runOwnedCase, graph, target, cold, categoryURL, genericURL, patch, editable, browserAcknowledgement, noPrivateData, unavailableInput, consume } from './public-parity-spec-support';
function renderedPeopleNoteText(html:string){const template=document.createElement('template');template.innerHTML=html;return (template.content.textContent??'').replace(/\s+/g,' ').trim();}
function ownerNotFoundEvidence(body:unknown){const {error}=apiErrorSchema.parse(body);z.string().uuid().parse(error.requestId);expect(error.code).toBe('NOT_FOUND');expect(error.message).toBe('Resource unavailable');return {code:error.code,message:error.message};}
const client = qualificationClient();
for (const [index, title] of PEOPLE_CASES.entries())
    test(title, async ({ browser }, info) => runOwnedCase(client, browser, info, async (scope) => {
        const owner = await scope.context('ownerA'), foreign = await scope.context('ownerB'), anonymous = await scope.context('anonymous'), a = scope.manifest.personas.ownerA, b = scope.manifest.personas.ownerB, list = target(scope, 'people'), people = graph(scope, 'people');
        switch (index) {
            case 0: {
                const page = await scope.client.trackProducer(() => owner.newPage());
                await scope.client.trackProducer(() => page.goto('/recommendations/people'));
                await page.getByRole('button', { name: 'New List', exact: true }).click();
                await page.getByPlaceholder('e.g. Favorite Creators, Inspiring Founders').fill('Native manual qualification list');
                const collection = await browserAcknowledgement(scope, page, '/collections', 'POST', 201, () => page.getByRole('button', { name: 'Create List', exact: true }).click());
                const id = collection.collection.id;
                await scope.client.trackProducer(() => page.goto(`/recommendations/people/${id}/add`));
                await page.getByLabel('Full Name', { exact: true }).fill('Native manual qualification person');
                const saved = await browserAcknowledgement(scope, page, '/recommendations', 'POST', 201, () => page.getByRole('button', { name: 'Save person', exact: true }).click());
                const recommendation = saved.recommendation;
                const initial: any = await editable(scope, owner, 'recommendations', recommendation.id);
                expect(initial.userRating).toBeNull();
                expect(initial.note).toBeNull();
                for (const key of ['usernameHandle', 'headline', 'locationText', 'avatarUrl', 'primaryPlatform', 'externalFollowerCountText'])
                    expect(initial.entity.details[key]).toBeNull();
                expect(initial.entity.details.socialUrls).toEqual({});
                expect(initial.entity.details.skillsTags).toEqual([]);
                await scope.client.trackProducer(() => page.goto(`/recommendations/people/${id}/edit/${recommendation.id}`));
                await page.getByLabel('Headline / Role', { exact: true }).fill('Explicit owner presentation');
                await page.locator('.ql-editor[contenteditable="true"]').fill('Native qualification note');
                await browserAcknowledgement(scope, page, `/recommendations/${recommendation.id}`, 'PATCH', 200, () => page.getByRole('button', { name: 'Save person', exact: true }).click());
                await scope.client.trackProducer(() => page.reload());
                const final: any = await editable(scope, owner, 'recommendations', recommendation.id);
                expect(final.effectivePersonDetails.headline).toBe('Explicit owner presentation');
                expect(final.note).toMatchObject({ version: 1, format: 'quill-html' });
                expect(await scope.client.trackProducer(() => page.evaluate(renderedPeopleNoteText, final.note.html))).toBe('Native qualification note');
                expect(final.userRating).toBeNull();
                const observed = await scope.observe(), actual = observed.categories[0].items.find(row => row.id === recommendation.id)!;
                expect(actual.creation?.operation).toBe('createRecommendation');
                expect(actual.collectionId).toBe(id);
                expect(actual.editable).toEqual(final);
                break;
            }
            case 1: {
                const entities = people.entities.filter(row => row.key.startsWith('same-name'));
                expect(entities).toHaveLength(2);
                expect(entities[0].title).toBe(entities[1].title);
                expect(entities[0].id).not.toBe(entities[1].id);
                const matching = people.entities.find(row => row.key === 'matching-account-handle')!;
                expect((matching.details as any).usernameHandle).toBe(b.handle);
                for (const entity of entities) {
                    const row = people.items.find(row => row.entityId === entity.id)!;
                    const actual: any = await editable(scope, owner, 'recommendations', row.id);
                    expect(actual.entityId).toBe(entity.id);
                }
                expect((await scope.read(owner, '/me')).body.account.id).toBe(a.accountId);
                expect((await scope.read(foreign, '/me')).body.account.id).toBe(b.accountId);
                await scope.read(foreign, `/recommendations/${people.items[0].id}/editable?status=all`, 404);
                break;
            }
            case 2: {
                const entity = people.entities.find(row => row.key === 'shared-person')!, first = people.items.find(row => row.entityId === entity.id && row.accountId === a.accountId)!, second = people.items.find(row => row.entityId === entity.id && row.accountId === b.accountId)!;
                const base: any = await editable(scope, foreign, 'recommendations', second.id);
                await patch(scope, owner, 'recommendations', first.id, { displayOverrides: { headline: 'Only owner A presentation' } });
                const actual: any = await editable(scope, owner, 'recommendations', first.id);
                expect(actual.effectivePersonDetails.headline).toBe('Only owner A presentation');
                expect(actual.entity.details).toEqual(base.entity.details);
                expect((await editable(scope, foreign, 'recommendations', second.id)) as any).toEqual(base);
                expect(actual.effectivePersonDetails.usernameHandle).toBe(base.entity.details.usernameHandle);
                const missing = ownerNotFoundEvidence((await scope.read(foreign, `/recommendations/${randomUUID()}/editable?status=all`, 404)).body);
                expect(ownerNotFoundEvidence((await scope.read(foreign, `/recommendations/${first.id}/editable?status=all`, 404)).body)).toEqual(missing);
                const page = await scope.client.trackProducer(() => owner.newPage());
                await scope.client.trackProducer(() => page.goto(`/recommendations/people/${list.id}/edit/${first.id}`));
                await page.getByLabel('Headline / Role', { exact: true }).fill('Unsaved stale draft');
                await patch(scope, owner, 'recommendations', first.id, { displayOverrides: { headline: 'Newer canonical presentation' } });
                await page.getByRole('button', { name: 'Save person', exact: true }).click();
                await expect(page.getByRole('alert')).toBeVisible();
                await expect(page.getByLabel('Headline / Role', { exact: true })).toHaveValue('Unsaved stale draft');
                expect((await editable(scope, owner, 'recommendations', first.id) as any).effectivePersonDetails.headline).toBe('Newer canonical presentation');
                break;
            }
            case 3: {
                const entity = people.entities.find(row => row.key === 'eligible-control')!, row = people.items.find(row => row.entityId === entity.id && row.accountId === a.accountId)!;
                await patch(scope, owner, 'recommendations', row.id, { publicationState: 'draft' });
                await scope.read(anonymous, `${genericURL(a.handle, 'people', list.slug)}/${row.id}`, 404);
                await patch(scope, owner, 'recommendations', row.id, { publicationState: 'published' });
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title);
                await page.getByText(row.title, { exact: true }).first().click();
                await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
                await expect(page.locator('a[href="https://example.test/person"]')).toBeVisible();
                const body = (await scope.read(anonymous, `${categoryURL(a.handle, 'people')}/${list.slug}`)).body;
                const person = body.personLists[0].recommended_people.find((value: any) => value.documentId === row.id);
                expect(person).toBeDefined();
                noPrivateData(person);
                expect(JSON.stringify(person)).not.toContain(a.userId);
                expect(JSON.stringify(person)).not.toContain(b.userId);
                await patch(scope, owner, 'collections', list.id, { visibility: 'private' });
                await scope.read(anonymous, `${categoryURL(a.handle, 'people')}/${list.slug}`, 404);
                await scope.client.trackProducer(() => page.reload());
                await expect(page.getByText(row.title, { exact: true })).toHaveCount(0);
                break;
            }
            case 4: {
                const suppressed = people.entities.find(row => row.key === 'pre-suppressed')!, eligible = people.entities.find(row => row.key === 'eligible-control')!, row = people.items.find(row => row.entityId === suppressed.id)!;
                const actual: any = await editable(scope, owner, 'recommendations', row.id);
                expect(actual.entity.suppressed).toBe(true);
                expect(actual.entity.id).toBe(suppressed.id);
                const body = (await scope.read(anonymous, `${categoryURL(a.handle, 'people')}/${list.slug}`)).body, ids = body.personLists[0].recommended_people.map((person: any) => person.person?.documentId ?? person.personId ?? person.documentId);
                expect(JSON.stringify(body)).not.toContain(row.id);
                expect(JSON.stringify(body)).toContain(people.items.find(item => item.entityId === eligible.id)!.id);
                const page = await cold(scope, anonymous, `/${a.handle}/people/${list.slug}`, list.title);
                await expect(page.getByText(suppressed.title, { exact: true })).toHaveCount(0);
                await expect(page.getByText(eligible.title, { exact: true }).first()).toBeVisible();
                expect(ids.length).toBeGreaterThan(0);
                const after = await scope.observe();
                expect(after.categories[0].entities.find(entity => entity.id === suppressed.id)).toEqual(suppressed);
                break;
            }
            case 5: {
                const page = await scope.client.trackProducer(() => owner.newPage());
                await scope.client.trackProducer(() => page.goto(`/recommendations/people/${list.id}/add`));
                await expect(page.getByLabel('Sector', { exact: true })).toBeVisible();
                await expect(page.getByLabel('Sector', { exact: true }).locator('option')).toHaveCount(1);
                const catalog = (await scope.read(owner, '/catalog/taxonomy?category=people&limit=24')).body;
                expect(catalog).toMatchObject({ state: 'CONFIGURED', catalogVersion: 1, defaultLocale: 'en', items: [], nextCursor: null });
                for (const row of people.items)
                    expect((await editable(scope, owner, 'recommendations', row.id) as any).peopleSector).toMatchObject({ catalogState: 'CONFIGURED', catalogVersion: 1, sector: null, selectionUnavailable: false });
                await scope.read(anonymous, `${BASE}/profiles/${a.handle}/recommendations/people/sectors/no-configured-sector`, 404);
                unavailableInput(info, 'people-configured-empty-positive-sector-unavailable');
                const row = people.items[0], current: any = await editable(scope, owner, 'recommendations', row.id);
                await scope.client.trackProducer(async () => consume(await owner.request.patch(`${BASE}/recommendations/${row.id}`, { headers: { Origin: scope.manifest.origin, 'Idempotency-Key': randomUUID() }, data: { expectedRevision: current.revision, peopleSectorTermId: randomUUID() } }), 422));
                expect(await editable(scope, owner, 'recommendations', row.id)).toEqual(current);
                break;
            }
            default: throw Error('PEOPLE_CASE_UNRESOLVED');
        }
    }));
