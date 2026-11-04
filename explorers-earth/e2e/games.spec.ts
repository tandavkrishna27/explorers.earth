import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { createCollectionResultSchema, createCollectionSchema, createRecommendationSchema, entityCoreDtoSchema, recommendationCoreDtoSchema, resolveManualGameSchema } from '../../tunes/shared/explorersContract';
import { gameCandidatePageSchema } from '../../tunes/shared/explorersGameContract';

// Flow 3. Replaces the Strapi-era flow (GraphQL list/recommendation mutations and a direct
// game API). Runs on the contained owner fixture and stubs only the catalog search and the
// commands the pages really send, each answered only after its body parses against the
// shared contract. A search hit only fills the form: the game is saved as the owner's own
// manual entry, so the resolve body must carry the hit's year, platforms and genres. The
// contained native Games reader serves recommendation-free lists only, so the saved item is
// asserted on what was written; the list itself is read back natively.

const LIST = 'favorite-games';

test('Flow 3: Games List and Recommendation creation E2E', async ({ browser, baseURL }) => {
  const state = fixtureState();
  state.lists.gameLists = [];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', LIST);
  const entityId = bookFixtureId('entity', 'portal-2');
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() === 'GET' && path === '/api/explorers/v1/catalog/games') {
      writes.push({ path, body: url.searchParams.get('query') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(gameCandidatePageSchema.parse({
        version: 'explorers-game-candidates/v1', nextCursor: null,
        items: [{ externalId: '72', title: 'Portal 2', year: 2011, coverUrl: null, platforms: ['PC'], genres: ['Puzzle'], developer: 'Valve' }] })) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/collections') {
      const body = createCollectionSchema.parse(request.postDataJSON()); writes.push({ path, body });
      state.lists.gameLists.push({ documentId: LIST, List_Name: body.title, Title: body.title, slug: body.slug, Visibility: false, visibility: false,
        account: { documentId: state.account.documentId, username: state.account.username }, recommended_games: [] });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ collection: createCollectionResultSchema.parse({
        id: collectionId, accountId: canonicalAccountFixture().id, category: 'games', title: body.title, slug: body.slug,
        visibility: body.visibility, publicationState: body.publicationState, revision: 1, description: body.description,
        heading: body.heading, coverMediaId: null, isSample: false }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = resolveManualGameSchema.parse(request.postDataJSON()); writes.push({ path, body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: entityCoreDtoSchema.parse({
        id: entityId, kind: 'game', title: body.details.title }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = createRecommendationSchema.parse(request.postDataJSON()); writes.push({ path, body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: bookFixtureId('recommendation', 'portal-2'), accountId: canonicalAccountFixture().id, entityId, category: 'games',
        userRating: body.userRating, publicationState: body.publicationState, revision: 1, mediaIds: body.mediaIds }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto('/recommendations/games', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'New list' }).filter({ visible: true }).first().click();
    await page.getByPlaceholder('e.g. Couch co-op games').fill('My Favorite Games');
    await page.getByRole('button', { name: 'Create list', exact: true }).click();
    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/collections')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/collections')!.body)
      .toMatchObject({ category: 'games', title: 'My Favorite Games', visibility: 'private', publicationState: 'draft' });

    await page.goto(`/recommendations/games/${collectionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'My Favorite Games' })).toBeVisible();
    await page.getByRole('button', { name: /Add game/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/recommendations/games/${collectionId}/add$`));

    await page.getByPlaceholder('Search for a game...').fill('Portal 2');
    await page.getByRole('option').filter({ hasText: 'Portal 2' }).click();
    const note = page.locator('.ql-editor');
    await expect(note).toBeVisible();
    await note.fill('Greatest puzzle co-op game ever.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')!.body).toEqual({ kind: 'manual', category: 'games',
      details: { title: 'Portal 2', releaseYear: 2011, platforms: ['PC'], genres: ['Puzzle'], developer: 'Valve' } });
    const recommendation = writes.find((w) => w.path === '/api/explorers/v1/recommendations')!.body;
    expect(recommendation).toMatchObject({ category: 'games', entityId, collectionId });
    expect(recommendation.note.html.replaceAll('&nbsp;', ' ')).toContain('Greatest puzzle co-op game ever.');
    await expect(page).toHaveURL(new RegExp(`/recommendations/games/${collectionId}$`));
  } finally {
    await closeFixture(handle);
  }
});
