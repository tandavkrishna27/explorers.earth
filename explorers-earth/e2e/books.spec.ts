import { expect, test } from '@playwright/test';
import { bookFixtureId } from './setup/books-owner-content';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { categoryTopPicksInputSchema, categoryTopPicksResultSchema, createCollectionResultSchema, createCollectionSchema, createRecommendationSchema, recommendationCoreDtoSchema } from '../../tunes/shared/explorersContract';
import { bookCoverImportResultSchema, importBookCoversSchema } from '../../tunes/shared/explorersBookCoverContract';
import { bookCandidatesSchema, bookEntityDtoSchema, emptyBookDetails, resolveProviderBookSchema } from '../../tunes/shared/explorersBookContract';

// Flow 2. Replaces the Strapi-era flow (GraphQL createBookList / createRecommendedBook and a
// direct Google Books call). Runs on the contained owner fixture, whose native Books reads are
// built from state.lists.bookLists, and stubs only the three commands the pages really send
// (create collection, resolve entity, create recommendation) plus the catalog search. Each
// command is answered only after its body parses against the shared contract, and the
// created rows are written back into the fixture so the list page reads them natively.

const LIST = 'summer-reads';
const BOOK = 'clean-code';
const VOLUME = 'cleanCode2008';
const provenance = { provider: 'google_books', externalKind: 'volume', externalId: VOLUME, fetchedAt: 1,
  sourceUrl: `https://www.googleapis.com/books/v1/volumes/${VOLUME}`, mappingVersion: 1 } as const;
const details = { ...emptyBookDetails(), subtitle: 'A Handbook of Agile Software Craftsmanship', authors: ['Robert C. Martin'], yearText: '2008', pageCount: 464 };

test('Flow 2: Books List and Recommendation creation E2E', async ({ browser, baseURL }) => {
  const state = fixtureState();
  state.lists.bookLists = [];
  const handle = await openFixture(browser, baseURL!, state, { owner: true });
  const writes: { path: string; body: any }[] = [];
  const collectionId = bookFixtureId('collection', LIST);
  const entityId = bookFixtureId('entity', BOOK);
  await handle.page.route('**/api/explorers/v1/**', async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() === 'GET' && path === '/api/explorers/v1/catalog/books') {
      writes.push({ path, body: url.searchParams.get('query') });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(bookCandidatesSchema.parse({
        version: 'explorers-book-candidates/v1', nextCursor: null, expiresAt: Date.now() + 600000,
        items: [{ provider: 'google_books', externalKind: 'volume', externalId: VOLUME, title: 'Clean Code', preview: details, provenance, buyLinkSuggestion: null }] })) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/collections') {
      const body = createCollectionSchema.parse(request.postDataJSON()); writes.push({ path, body });
      state.lists.bookLists.push({ documentId: LIST, List_Name: body.title, Title: body.title, slug: body.slug, Visibility: false, visibility: false,
        list_description: body.description, account: { documentId: state.account.documentId, username: state.account.username }, recommended_books: [] });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ collection: createCollectionResultSchema.parse({
        id: collectionId, accountId: canonicalAccountFixture().id, category: 'books', title: body.title, slug: body.slug,
        visibility: body.visibility, publicationState: body.publicationState, revision: 1, description: body.description,
        heading: body.heading, coverMediaId: null, isSample: false }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/entities/resolve') {
      const body = resolveProviderBookSchema.parse(request.postDataJSON()); writes.push({ path, body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ entity: bookEntityDtoSchema.parse({
        id: entityId, kind: 'book', title: 'Clean Code', details, provenance, origin: 'provider' }) }) });
    }
    if (request.method() === 'POST' && path === '/api/explorers/v1/recommendations') {
      const body = createRecommendationSchema.parse(request.postDataJSON()); writes.push({ path, body });
      state.lists.bookLists[0].recommended_books.push({ documentId: BOOK, title: 'Clean Code', authors: details.authors, user_rating: body.userRating });
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: recommendationCoreDtoSchema.parse({
        id: bookFixtureId('recommendation', BOOK), accountId: canonicalAccountFixture().id, entityId, category: 'books',
        userRating: body.userRating, publicationState: body.publicationState, revision: 1, mediaIds: [] }) }) });
    }
    // A provider book copies its cover after the create; the catalog offered none, so both
    // slots fall back.
    if (request.method() === 'POST' && path === `/api/explorers/v1/recommendations/${bookFixtureId('recommendation', BOOK)}/book-covers`) {
      const body = importBookCoversSchema.parse(request.postDataJSON()); writes.push({ path: 'book-covers', body });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ coverImport: bookCoverImportResultSchema.parse({
        id: bookFixtureId('recommendation', BOOK), revision: body.expectedRevision + 1, slots: { cover: { status: 'fallback' }, thumbnail: { status: 'fallback' } } }) }) });
    }
    // The add page saves the category's Top Picks set together with the book.
    if (request.method() === 'PUT' && path === '/api/explorers/v1/categories/books/top-picks') {
      const body = categoryTopPicksInputSchema.parse(request.postDataJSON()); writes.push({ path: 'top-picks', body });
      body.orderedPins.forEach((pin, position) => {
        const book = state.lists.bookLists[0].recommended_books.find((item: any) => bookFixtureId('recommendation', item.documentId) === pin.recommendationId);
        if (book) Object.assign(book, { is_pinned: true, pin_order: position });
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ topPicks: categoryTopPicksResultSchema.parse({
        operation: 'replace', categoryRevision: String(Number(body.expectedCategoryRevision) + 1), pinRevision: (body.expectedPinRevision ?? 0) + 1,
        pins: body.orderedPins.map((pin, position) => ({ ...pin, position })) }) }) });
    }
    return route.fallback();
  });
  try {
    const { page } = handle;
    await page.goto('/recommendations/books', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'New list' }).filter({ visible: true }).first().click();
    await page.getByPlaceholder('e.g. Summer reads').fill('My Summer Reads');
    await page.getByRole('button', { name: 'Create list', exact: true }).click();
    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/collections')).toBe(true);
    const created = writes.find((w) => w.path === '/api/explorers/v1/collections')!.body;
    expect(created).toMatchObject({ category: 'books', title: 'My Summer Reads', visibility: 'private', publicationState: 'draft' });

    await page.goto(`/recommendations/books/${collectionId}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add book' }).first().click();
    await expect(page).toHaveURL(new RegExp(`/recommendations/books/${collectionId}/add$`));

    await page.getByPlaceholder('Search by title, author, or ISBN...').fill('Clean Code');
    await page.getByRole('option').filter({ hasText: 'Clean Code' }).click();
    const note = page.locator('.ql-editor');
    await expect(note).toBeVisible();
    await note.fill('Essential guide to programming craft.');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect.poll(() => writes.some((w) => w.path === '/api/explorers/v1/recommendations')).toBe(true);
    expect(writes.find((w) => w.path === '/api/explorers/v1/entities/resolve')!.body)
      .toEqual({ kind: 'provider', category: 'books', provider: 'google_books', externalKind: 'volume', externalId: VOLUME });
    const recommendation = writes.find((w) => w.path === '/api/explorers/v1/recommendations')!.body;
    expect(recommendation).toMatchObject({ category: 'books', entityId, collectionId });
    expect(recommendation.note.html.replaceAll('&nbsp;', ' ')).toContain('Essential guide to programming craft.');

    expect(writes.find((w) => w.path === 'book-covers')!.body).toEqual({ expectedRevision: 1 });
    expect(writes.find((w) => w.path === 'top-picks')!.body.orderedPins)
      .toEqual([]); // "Pin to Top Reads" was left off, so the category keeps no pins.

    await expect(page).toHaveURL(new RegExp(`/recommendations/books/${collectionId}$`));
    await expect(page.getByText('Clean Code', { exact: true }).first()).toBeVisible();
  } finally {
    await closeFixture(handle);
  }
});
