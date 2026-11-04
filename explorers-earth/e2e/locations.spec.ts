import { test, expect, type Browser } from '@playwright/test';
import { closeFixture, fixtureState, openFixture } from './setup/category-navigation';
import { bookFixtureId } from './setup/books-owner-content';
import { canonicalAccountFixture } from '../src/test/canonicalAccountFixture';
import { emptyPlaceDetails } from '../../tunes/shared/explorersPlaceContract';
import { createCollectionResultSchema, createCollectionSchema } from '../../tunes/shared/explorersContract';

// Flow 8 used to drive the Strapi-era "Add Location" step-2 view (GraphQL list mutation,
// Gemini category mapping, the Quill note and the /new recommendation form). All of that is
// gone: a Places list is now created from the shared "New list" dialog with a location
// picked from Google autocomplete, and a place is added on the shared add page, whose four
// entry paths are covered by "Places add page entry paths" below. This flow keeps the
// intent - create a places list from an autocompleted city, land on it, open its add page -
// on the contained canonical owner fixture, stubbing only Google and the create command.
test('Flow 8: Locations List and Autocomplete E2E', async ({ browser, baseURL }) => {
  const state = fixtureState();
  const fixture = await openFixture(browser, baseURL!, state, { owner: true });
  const { context, page } = fixture;
  await context.addInitScript(() => {
    // The real loader defines the google global; the widget clears its listeners through it.
    (globalThis as any).google = { maps: { event: { clearInstanceListeners: () => {} } } };
    (globalThis as any).__mapsFixture = { places: {
      suggestions: [], place: { id: 'g-paris', displayName: 'Paris', formattedAddress: 'Paris, France', lat: 48.8566, lng: 2.3522 },
      legacyPlace: {
        place_id: 'g-paris', name: 'Paris', formatted_address: 'Paris, France',
        geometry: { location: { lat: () => 48.8566, lng: () => 2.3522 } },
        address_components: [
          { long_name: 'Paris', short_name: 'Paris', types: ['locality'] },
          { long_name: 'France', short_name: 'FR', types: ['country'] },
        ],
      },
    } };
  });
  const googleReads: string[] = [];
  await page.route(url => url.hostname === 'places.googleapis.com', async route => {
    googleReads.push(new URL(route.request().url()).pathname);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 'g-paris', displayName: { text: 'Paris' }, formattedAddress: 'Paris, France', primaryType: 'locality',
      primaryTypeDisplayName: { text: 'City' }, location: { latitude: 48.8566, longitude: 2.3522 }, photos: [],
    }) });
  });
  const createdId = bookFixtureId('collection', 'paris-trip');
  const creates: unknown[] = [];
  await page.route(url => url.pathname === '/api/explorers/v1/collections', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = createCollectionSchema.parse(route.request().postDataJSON());
    creates.push(body);
    // The created list is what the owner reads from now on.
    const template = state.lists.recommendationLists[0];
    state.lists.recommendationLists = [...state.lists.recommendationLists, {
      ...template, documentId: 'paris-trip', List_Name: body.title, Title: body.title, slug: body.slug, Visibility: false, visibility: false,
    }];
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ collection: createCollectionResultSchema.parse({
      id: createdId, accountId: canonicalAccountFixture().id, category: 'places', title: body.title, slug: body.slug,
      visibility: 'private', publicationState: 'draft', revision: 1, description: null, heading: null, coverMediaId: null, isSample: false,
    }) }) });
  });
  try {
    await page.goto('/recommendations/places', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'New list' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New list' });
    await expect(dialog).toBeVisible();

    const location = dialog.getByPlaceholder('Search a city or area (e.g. Goa)');
    await location.fill('Paris');
    await expect.poll(() => location.evaluate((input) => (input as any)._autocompleteMock !== undefined)).toBe(true);
    await location.evaluate((input) => (input as any)._autocompleteMock.select());

    // The picked city names the list and its web address unless the owner typed one.
    await expect(dialog.locator('#wp3a-name')).toHaveValue('Paris');
    await dialog.locator('#wp3a-slug').fill('paris-trip');
    await dialog.getByRole('button', { name: 'Create list' }).click();

    await expect(page.getByText('List created')).toBeVisible();
    await page.waitForURL(new RegExp(`/recommendations/places/${createdId}$`));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toMatchObject({
      category: 'places', title: 'Paris', slug: 'paris-trip', visibility: 'private', publicationState: 'draft',
      placeLocation: { locationEntityId: null, locationSnapshot: {
        providerPlaceId: 'g-paris', name: 'Paris', address: 'Paris, France', latitude: 48.8566, longitude: 2.3522,
      } },
    });
    expect(googleReads.every(path => path === '/v1/places/g-paris')).toBe(true);

    await page.goto(`/recommendations/places/${createdId}/add`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByPlaceholder('Search a place or paste coordinates')).toBeVisible();
  } finally {
    await closeFixture(fixture);
  }
});

// WP6 (Task 6-8): the four ways to add a place on the shared add page. Owner reads, auth and
// the taxonomy catalog come from the contained fixture; the nearby endpoint and the two save
// commands are stubbed here so each case can save and land on the shared list route.
test.describe('Places add page entry paths', () => {
  const listId = bookFixtureId('collection', 'places-list');
  type Harness = Awaited<ReturnType<typeof openPlacesAdd>>;
  async function openPlacesAdd(browser: Browser, baseURL: string, mapsFixture: Record<string, unknown> = {}) {
    const fixture = await openFixture(browser, baseURL, fixtureState(), { owner: true });
    const { context, page } = fixture;
    await context.addInitScript((value) => { (globalThis as any).__mapsFixture = value; }, mapsFixture);
    const nearbyRequests: string[] = [];
    await page.route(url => url.pathname === '/api/explorers/v1/places/nearby', async route => {
      nearbyRequests.push(route.request().url());
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'google', places: [
        { id: 'nearby-1', title: 'Miramar Beach', subtitle: 'Beach', lat: 15.4909, lng: 73.8165 },
      ] }) });
    });
    const created: { entity?: any; recommendation?: any } = {};
    await page.route(url => url.pathname === '/api/explorers/v1/entities/resolve', async route => {
      const body = route.request().postDataJSON();
      created.entity = body;
      const { title, ...details } = body.details;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ entity: {
        id: bookFixtureId('entity', title), kind: 'place', title, details: { ...emptyPlaceDetails(), ...details }, origin: 'manual', providerPlaceId: null,
      } }) });
    });
    await page.route(url => url.pathname === '/api/explorers/v1/recommendations', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON();
      created.recommendation = body;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ recommendation: {
        id: bookFixtureId('recommendation', body.entityId), accountId: canonicalAccountFixture().id, entityId: body.entityId,
        category: 'places', userRating: body.userRating ?? null, publicationState: 'published', revision: 1, mediaIds: [],
      } }) });
    });
    await page.goto(`/recommendations/places/${listId}/add`);
    await expect(page.getByPlaceholder('Search a place or paste coordinates')).toBeVisible();
    return { fixture, context, page, nearbyRequests, created };
  }
  async function saveAndLand({ page, created }: Harness, title?: string) {
    if (title) await page.getByLabel('Place name').fill(title);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(new RegExp(`/recommendations/places/${listId}$`));
    return created;
  }

  test('adds a place by name', async ({ browser, baseURL }) => {
    const h = await openPlacesAdd(browser, baseURL!, { places: {
      suggestions: [{ placeId: 'g-fontainhas', main: 'Fontainhas', secondary: 'Panaji, Goa' }],
      place: { id: 'g-fontainhas', displayName: 'Fontainhas', formattedAddress: 'Panaji, Goa', lat: 15.4989, lng: 73.8278 },
    } });
    // The WP5 save path reads the picked Google place's facts once (and its photos); the
    // fixture answers as Google would, with no photos.
    const googleReads: string[] = [];
    await h.page.route(url => url.hostname === 'places.googleapis.com', async route => {
      googleReads.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        id: 'g-fontainhas', displayName: { text: 'Fontainhas' }, formattedAddress: 'Panaji, Goa', location: { latitude: 15.4989, longitude: 73.8278 }, photos: [],
      }) });
    });
    await h.page.getByPlaceholder('Search a place or paste coordinates').fill('Fontain');
    await h.page.getByRole('option', { name: /Fontainhas/ }).click();
    await expect(h.page.getByRole('status').filter({ hasText: 'Fontainhas' })).toBeVisible();
    const created = await saveAndLand(h);
    expect(created.entity.details).toMatchObject({ title: 'Fontainhas', formattedAddress: 'Panaji, Goa', latitude: 15.4989, longitude: 73.8278 });
    expect(googleReads.every(path => path === '/v1/places/g-fontainhas')).toBe(true);
    await closeFixture(h.fixture);
  });

  test('adds a place by coordinates with one nearby lookup per area', async ({ browser, baseURL }) => {
    const h = await openPlacesAdd(browser, baseURL!);
    const search = h.page.getByPlaceholder('Search a place or paste coordinates');
    await search.fill('15.49, 73.82');
    await expect(h.page.getByText('Pin at 15.4900, 73.8200')).toBeVisible();
    await expect(h.page.getByRole('option', { name: /Miramar Beach/ })).toBeVisible();
    await search.fill('15.4901, 73.8201');
    await expect(h.page.getByText('Pin at 15.4901, 73.8201')).toBeVisible();
    await expect(h.page.getByRole('option', { name: /Miramar Beach/ })).toBeVisible();
    expect(h.nearbyRequests).toHaveLength(1);
    await h.page.getByRole('button', { name: 'Use the pin as a custom place' }).click();
    const created = await saveAndLand(h, 'Secret cove');
    expect(created.entity.details).toMatchObject({ title: 'Secret cove', latitude: 15.4901, longitude: 73.8201 });
    await closeFixture(h.fixture);
  });

  test('adds a place by my location', async ({ browser, baseURL }) => {
    const h = await openPlacesAdd(browser, baseURL!);
    await h.context.grantPermissions(['geolocation']);
    await h.context.setGeolocation({ latitude: 15.49, longitude: 73.82 });
    expect(h.nearbyRequests).toHaveLength(0);
    await h.page.getByRole('button', { name: 'Use my current location' }).click();
    await expect(h.page.getByRole('option', { name: /Miramar Beach/ })).toBeVisible();
    expect(h.nearbyRequests).toHaveLength(1);
    await h.page.getByRole('button', { name: 'Use the pin as a custom place' }).click();
    const created = await saveAndLand(h, 'Where I stand');
    expect(created.entity.details).toMatchObject({ latitude: 15.49, longitude: 73.82 });
    await closeFixture(h.fixture);
  });

  test('adds a place by map pin', async ({ browser, baseURL }) => {
    const h = await openPlacesAdd(browser, baseURL!, { click: { lat: 15.55, lng: 73.75 } });
    await h.page.getByRole('button', { name: 'Pick on map' }).click();
    await h.page.getByRole('button', { name: 'Fixture map' }).click();
    await h.page.getByRole('button', { name: 'Use this pin' }).click();
    const created = await saveAndLand(h, 'Dropped pin');
    expect(created.entity.details).toMatchObject({ title: 'Dropped pin', latitude: 15.55, longitude: 73.75 });
    expect(h.nearbyRequests).toHaveLength(0);
    await closeFixture(h.fixture);
  });
});
