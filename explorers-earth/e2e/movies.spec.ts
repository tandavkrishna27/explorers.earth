import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { createCollectionResultSchema, createCollectionSchema, createRecommendationSchema, recommendationCoreDtoSchema } from '../../tunes/shared/explorersContract';
import { movieCandidatesSchema, movieEntityDtoSchema, resolveProviderMovieSchema } from '../../tunes/shared/explorersMovieContract';

// Flow 1. Replaces the Strapi-era flow (GraphQL list/recommendation mutations and direct TMDB
// calls). Runs on the contained owner fixture and stubs only the catalog search and the
// commands the pages really send, each answered only after its body parses against the
// shared contract. The contained native Movies reader serves recommendation-free lists only,
// so the saved item is asserted on what was written; the list itself is read back natively.

const LIST = 'favorite-sci-fi';
const TMDB_ID = '157336';

test('Flow 1: Movies List and Recommendation creation E2E', async ({ browser, baseURL }) => {
  const state = fixtureState();
  state.lists.movieLists = [];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', LIST);
  const entityId = bookFixtureId('entity', 'interstellar');
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() === 'GET' && path === '/api/explorers/v1/catalog/movies') {
      writes.push({ path, body: url.searchParams.get('query') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(movieCandidatesSchema.parse({
        version: 'explorers-movie-candidates/v1', nextCursor: null, expiresAt: Date.now() + 600000,
        items: [{ provider: 'tmdb', externalKind: 'movie', externalId: TMDB_ID, title: 'Interstellar', posterUrl: null, yearText: '2014' }] })) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/collections') {
      const body = createCollectionSchema.parse(request.postDataJSON()); writes.push({ path, body });
      state.lists.movieLists.push({ documentId: LIST, List_Name: body.title, Title: body.title, slug: body.slug, Visibility: false, visibility: false,
        account: { documentId: state.account.documentId, username: state.account.username }, recommended_movies: [] });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ collection: createCollectionResultSchema.parse({
        id: collectionId, accountId: canonicalAccountFixture().id, category: 'movies', title: body.title, slug: body.slug,
        visibility: body.visibility, publicationState: body.publicationState, revision: 1, description: body.description,
        heading: body.heading, coverMediaId: null, isSample: false }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = resolveProviderMovieSchema.parse(request.postDataJSON()); writes.push({ path, body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: movieEntityDtoSchema.parse({
        id: entityId, kind: 'movie', title: 'Interstellar', origin: 'provider',
        details: { mediaType: 'movie', originalTitle: 'Interstellar', yearText: '2014', posterUrl: null, backdropUrl: null, genres: [],
          director: 'Christopher Nolan', runtimeMinutes: 169, providerRating: 8.4, overview: null, seasonCount: null, watchProviders: {}, cast: [] },
        provenance: { provider: 'tmdb', externalKind: 'movie', externalId: TMDB_ID, fetchedAt: 1, sourceUrl: `https://api.themoviedb.org/3/movie/${TMDB_ID}`, mappingVersion: 1 } }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = createRecommendationSchema.parse(request.postDataJSON()); writes.push({ path, body });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: bookFixtureId('recommendation', 'interstellar'), accountId: canonicalAccountFixture().id, entityId, category: 'movies',
        userRating: body.userRating, publicationState: body.publicationState, revision: 1, mediaIds: [] }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto('/recommendations/movies', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'New list' }).filter({ visible: true }).first().click();
    await page.getByPlaceholder('e.g. Comfort movies').fill('My Favorite Sci-Fi');
    await page.getByRole('button', { name: 'Create list', exact: true }).click();
    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/collections')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/collections')!.body)
      .toMatchObject({ category: 'movies', title: 'My Favorite Sci-Fi', visibility: 'private', publicationState: 'draft' });

    await page.goto(`/recommendations/movies/${collectionId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'My Favorite Sci-Fi' })).toBeVisible();
    await page.getByRole('button', { name: /Add movie/i }).first().click();
    await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${collectionId}/add$`));

    await page.getByPlaceholder(/Interstellar/).fill('Interstellar');
    await page.getByRole('option').filter({ hasText: 'Interstellar' }).click();
    const note = page.locator('.ql-editor');
    await expect(note).toBeVisible();
    await note.fill('Masterpiece by Nolan.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')!.body)
      .toEqual({ kind: 'provider', category: 'movies', provider: 'tmdb', externalKind: 'movie', externalId: TMDB_ID });
    const recommendation = writes.find((w) => w.path === '/api/explorers/v1/recommendations')!.body;
    expect(recommendation).toMatchObject({ category: 'movies', entityId, collectionId });
    expect(recommendation.note.html.replaceAll('&nbsp;', ' ')).toContain('Masterpiece by Nolan.');
    await expect(page).toHaveURL(new RegExp(`/recommendations/movies/${collectionId}$`));
  } finally {
    await closeFixture(handle);
  }
});
