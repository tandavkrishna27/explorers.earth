import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddProductPage from '../AddProductPage';
import ProductListView from '../ProductListView';
import {ProductsClient} from '../../../api/productsClient';
import useAuthStore from '../../../../../store/store';
import '../../../../../i18n';
import {SUPPORTED_CURRENCIES} from '../../../../../../../tunes/shared/explorersProductContract';

// Replaces scrape-flow.integration.test.tsx and scrapePriceGuard.test.tsx. Both drove
// /api/products/scrape-link, which the server does not have, so they asserted the
// behaviour of a dead endpoint and of a guard that existed only to flag auto-filled
// prices. What that guard protected - never silently altering an owner's amount, never
// inventing a currency - is asserted here against the native path instead.

const fixture = vi.hoisted(() => ({content: {view: {lists: [] as unknown[]}, details: new Map(), observation: {}}, loading: false, error: undefined as Error | undefined, refetch: vi.fn()}));
vi.mock('../../../hooks/useProductsOwner', () => ({useProductsOwner: () => ({content: fixture.content, data: {productLists: fixture.content.view.lists}, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch}), invalidateProducts: vi.fn()}));
vi.mock('../../../api/productsClient', () => ({ProductsClient: {observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn(), observeRecommendation: vi.fn(), updateCollection: vi.fn(), archiveCollection: vi.fn(), archiveRecommendation: vi.fn(), createCollection: vi.fn(), readCompleteOwner: vi.fn(), setTopPicks: vi.fn(), prepareMembershipIntent: vi.fn(), saveMembership: vi.fn()}}));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({default: ({value, onChange}: {value: string; onChange: (value: string) => void}) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} />}));
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn(), loading: vi.fn()}}));

beforeAll(() => { globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver; });
// The currency is a select inline with the amount (DS-05).
const pickCurrency = (code: string) => fireEvent.change(screen.getByLabelText('Currency'), {target: {value: code}});
const region = (language: string) => vi.spyOn(navigator, 'language', 'get').mockReturnValue(language);

function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/products/list-1/add']}><Routes><Route path="/products/:listId/add" element={<AddProductPage />} /><Route path="/recommendations/products/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return {promise, resolve}; }
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), {target: {value}});
const draft = () => vi.mocked(ProductsClient.prepareManualIntent).mock.calls[0][1];

describe('native manual Products', () => {
 beforeEach(() => {
  vi.clearAllMocks(); fixture.loading = false; fixture.error = undefined; fixture.content.view.lists = []; fixture.content.details.clear();
  useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'});
  vi.mocked(ProductsClient.observeCollection).mockResolvedValue({detail: {id: 'list-1'}} as never);
  vi.mocked(ProductsClient.prepareManualIntent).mockImplementation((parent, d) => ({parent, draft: d, entityKey: 'entity-key', recommendationKey: 'recommendation-key'}) as never);
  vi.mocked(ProductsClient.createManual).mockResolvedValue({id: 'product-1'} as never);
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

 it('sends the amount exactly as typed, with its currency', async () => {
  mount();
  fill('Title', 'Keyboard'); fill('Where to buy', 'https://example.com/kb');
  fill('Brand', 'Keychron');
  fill('Price', '19.90'); pickCurrency('USD');
  fill('Note', '<p>Types nicely</p>');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  // "19.90", not 19.9: the owner's exact decimal reaches the command as a string.
  expect(draft()).toMatchObject({title: 'Keyboard', productUrl: 'https://example.com/kb', brand: 'Keychron',
   offer: {price: '19.90', currencyCode: 'USD', buyUrl: 'https://example.com/kb', affiliateDisclosed: false}});
 });

 it('treats an empty price as unknown rather than free, and an empty currency as unknown', async () => {
  mount(); fill('Title', 'Unpriced'); fill('Where to buy', 'https://example.com/unpriced');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: null, currencyCode: null, buyUrl: 'https://example.com/unpriced'}});
 });

 it('sends a zero price as zero, which is a price and not unknown', async () => {
  mount(); fill('Title', 'Free thing'); fill('Where to buy', 'https://example.com/free');
  fill('Price', '0.00'); pickCurrency('USD');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '0.00', currencyCode: 'USD'}});
 });

 it('sends the visible currency with the price, so a price never travels without one', async () => {
  region('en-IN');
  mount(); fill('Title', 'Rupee'); fill('Where to buy', 'https://example.com/inr');
  expect(screen.getByLabelText('Currency')).toHaveValue('INR');
  fill('Price', '499');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '499', currencyCode: 'INR'}});
 });

 it('starts on the currency of the browser\'s region, visibly, and drops it when there is no price', async () => {
  region('de-AT');
  mount(); fill('Title', 'Unpriced'); fill('Where to buy', 'https://example.com/unpriced');
  expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  // A currency with no price names nothing, so the suggestion is not sent on its own.
  expect(draft()).toMatchObject({offer: {price: null, currencyCode: null}});
 });

 // The substance of the retired scraped-price guard: an impossible amount is reported
 // before anything is dispatched, and the draft survives.
 it('refuses a malformed amount without dispatching, and keeps the draft', async () => {
  mount(); fill('Title', 'Bad price'); fill('Where to buy', 'https://example.com/bad');
  fill('Price', '$19.90');
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount like 19.90');
  expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  expect(ProductsClient.observeCollection).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Price')).toHaveValue('$19.90');
  expect(screen.getByLabelText('Title')).toHaveValue('Bad price');
 });

 it('refuses a precision the chosen currency does not have, and recovers when it changes', async () => {
  mount(); fill('Title', 'Yen'); fill('Where to buy', 'https://example.com/yen');
  fill('Price', '100.50'); pickCurrency('JPY');
  expect(await screen.findByRole('alert')).toHaveTextContent('JPY has no decimal places; enter a whole amount.');
  expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
  pickCurrency('USD');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '100.50', currencyCode: 'USD'}});
 });

 it('takes the amount as decimal text, so an exact decimal is never routed through a float', () => {
  mount();
  const price = screen.getByLabelText('Price') as HTMLInputElement;
  expect(price.type).not.toBe('number');
  expect(price.inputMode).toBe('decimal');
  fill('Price', '19.90');
  expect(price.value).toBe('19.90');
 });

 it('offers every supported currency', () => {
  mount();
  expect(within(screen.getByLabelText('Currency')).getAllByRole('option')).toHaveLength(Object.keys(SUPPORTED_CURRENCIES).length);
  expect(screen.getByRole('option', {name: 'KWD'})).toBeInTheDocument();
 });

 it('accepts three decimals for a three-decimal currency', async () => {
  mount(); fill('Title', 'Dinar'); fill('Where to buy', 'https://example.com/dinar');
  fill('Price', '1.250'); pickCurrency('KWD');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '1.250', currencyCode: 'KWD'}});
 });

 it('round-trips the specification list the owner entered, in order', async () => {
  mount(); fill('Title', 'Specced'); fill('Where to buy', 'https://example.com/specced');
  fireEvent.click(screen.getByRole('button', {name: '+ Add key fact'}));
  fill('Key fact name 1', 'Weight'); fill('Key fact value 1', '1kg');
  fireEvent.click(screen.getByRole('button', {name: '+ Add key fact'}));
  fill('Key fact name 2', 'Colour'); fill('Key fact value 2', 'Black');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({specifications: [{key: 'Weight', value: '1kg'}, {key: 'Colour', value: 'Black'}]});
 });

 it('saves specifications in the order the owner arranged them, announcing each move', async () => {
  mount(); fill('Title', 'Ordered'); fill('Where to buy', 'https://example.com/ordered');
  for (const [key, value] of [['A', '1'], ['B', '2'], ['C', '3']]) {
   fireEvent.click(screen.getByRole('button', {name: '+ Add key fact'}));
   const n = screen.getAllByLabelText(/^Key fact name/).length;
   fill(`Key fact name ${n}`, key); fill(`Key fact value ${n}`, value);
  }
  expect(screen.getByRole('button', {name: 'Move key fact 1 up'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Move key fact 3 up'}));
  fireEvent.click(screen.getByRole('button', {name: 'Move key fact 1 down'}));
  expect(screen.getByRole('status')).toHaveTextContent('Key fact 1 moved to position 2 of 3.');
  expect(screen.getByLabelText('Key fact name 1')).toHaveValue('C');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({specifications: [{key: 'C', value: '3'}, {key: 'A', value: '1'}, {key: 'B', value: '2'}]});
 });

 it('refuses to save without the product URL its storage requires', () => {
  mount(); fill('Title', 'No link');
  expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
  expect(ProductsClient.observeCollection).not.toHaveBeenCalled();
 });

 it('waits for uploaded snapshot readiness before saving', async () => {
  const upload = deferred<{id: string}>(); vi.mocked(ProductsClient.upload).mockReturnValue(upload.promise as never);
  mount(); fill('Title', 'Shot'); fill('Where to buy', 'https://example.com/shot');
  fireEvent.change(screen.getByLabelText('Photos'), {target: {files: [new File(['bytes'], 'shot.png', {type: 'image/png'})]}});
  expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
  await act(async () => upload.resolve({id: 'media-1'}));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({mediaIds: ['media-1']});
 });

 it('preserves every typed field when the save fails and retries the same intent', async () => {
  vi.mocked(ProductsClient.createManual).mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({id: 'product-1'} as never);
  mount(); fill('Title', 'Retained'); fill('Where to buy', 'https://example.com/retained'); fill('Price', '5.00'); pickCurrency('EUR');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Title')).toHaveValue('Retained');
  expect(screen.getByLabelText('Price')).toHaveValue('5.00');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(ProductsClient.prepareManualIntent).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ProductsClient.createManual).mock.calls[0][0]).toBe(vi.mocked(ProductsClient.createManual).mock.calls[1][0]);
 });

 it('cannot create a product once the account is replaced while the parent read is pending', async () => {
  const parent = deferred<never>(); vi.mocked(ProductsClient.observeCollection).mockReturnValue(parent.promise);
  mount(); fill('Title', 'Old owner'); fill('Where to buy', 'https://example.com/old');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  act(() => useAuthStore.getState().logout());
  await act(async () => parent.resolve({detail: {id: 'list-1'}} as never));
  expect(ProductsClient.prepareManualIntent).not.toHaveBeenCalled();
  expect(ProductsClient.createManual).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('');
 });

 it('describes deleting a list as archiving it, which is what the command does', async () => {
  fixture.content.view.lists = [{documentId: 'list-1', List_Name: 'Gear', slug: 'gear', Visibility: true, recommended_products: [], account: {documentId: 'a1', username: 'owner'}}];
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1']}><Routes><Route path="/recommendations/products/:listId" element={<ProductListView />} /></Routes></MemoryRouter></MockedProvider>);
  // LP-05: the Manage tab labels archiving "Archive list" and the action archives (never purges).
  vi.mocked(ProductsClient.observeCollection).mockResolvedValue({detail: {id: 'list-1'}} as never);
  vi.mocked(ProductsClient.archiveCollection).mockResolvedValue({} as never);
  fireEvent.click(screen.getByRole('tab', {name: 'Manage'}));
  fireEvent.click(screen.getByRole('button', {name: 'Archive list'}));
  expect(screen.getByText(/Archived lists are hidden and free their URL/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Archive'}));
  await waitFor(() => expect(ProductsClient.archiveCollection).toHaveBeenCalled());
  expect(screen.queryByText(/permanently delete/i)).toBeNull();
 });

 it('publishes the list from the publish pill without a per-recommendation publish control', async () => {
  const product = {documentId: 'product-a', title: 'Manual product', product_url: 'https://example.com/a', brand: null, price: null, currency: null,
   buy_url: null, logo_url: null, description: null, specifications: null, user_recommendation_note: '', user_rating: null, is_pinned: false,
   pin_order: null, display_order: 0, images: null, product_list: {documentId: 'list-1', List_Name: 'Published list', slug: 'published'}, product_category: null};
  fixture.content.view.lists = [{documentId: 'list-1', List_Name: 'Draft list', slug: 'published', Visibility: false, recommended_products: [product], account: {documentId: 'a1', username: 'owner'}}];
  const observed = {detail: {id: 'list-1', revision: 1, category: 'products'}};
  vi.mocked(ProductsClient.observeCollection).mockResolvedValue(observed as never);
  vi.mocked(ProductsClient.updateCollection).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1']}><Routes><Route path="/recommendations/products/:listId" element={<ProductListView />} /></Routes></MemoryRouter></MockedProvider>);
  // LP-04: the per-recommendation publish row is gone; publication is the list's.
  expect(screen.queryByText(/Recommendation is/)).toBeNull();
  expect(screen.queryByRole('button', {name: 'Publish Manual product'})).toBeNull();
  fireEvent.click(document.querySelector('[aria-haspopup="menu"]')!);
  fireEvent.click(screen.getByRole('menuitemradio', {name: /public/i}));
  await waitFor(() => expect(ProductsClient.updateCollection).toHaveBeenCalledWith(observed, {visibility: 'public', publicationState: 'published'}, expect.any(String), expect.any(AbortSignal)));
  expect(ProductsClient.updateRecommendation).not.toHaveBeenCalled();
 });
});

describe('manual Products edit', () => {
 function editElement() { return <MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1/edit/product-a']}><Routes><Route path="/recommendations/products/:listId/edit/:productId" element={<AddProductPage />} /></Routes></MemoryRouter></MockedProvider>; }
 function loaded(mediaIds: string[] = []) {
  const product = {documentId: 'product-a', title: 'Original title', product_url: 'https://example.com/original', brand: 'Acme', price: 19.9,
   currency: 'USD', buy_url: null, logo_url: null, description: null, specifications: {Weight: '1kg'}, user_recommendation_note: '<p>Note</p>',
   user_rating: 8, images: null, is_pinned: false, pin_order: null, display_order: 0, product_list: null, product_category: null};
  fixture.content.view.lists = [{documentId: 'list-1', recommended_products: [product]}];
  fixture.content.details.set('product-a', {detail: {id: 'product-a', revision: 1, category: 'products', mediaIds, productOffer: {price: '19.90', currencyCode: 'USD', buyUrl: null}}});
  fixture.content = {...fixture.content}; fixture.loading = false; fixture.error = undefined;
 }
 beforeEach(() => { vi.clearAllMocks(); fixture.content = {view: {lists: []}, details: new Map(), observation: {}}; fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'}); });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('hydrates the exact stored amount rather than the display number, and shows the stored link', async () => {
  loaded(); render(editElement());
  expect(await screen.findByLabelText('Title')).toHaveValue('Original title');
  // 19.90 from the observation, not 19.9 from the display conversion.
  expect(screen.getByLabelText('Price')).toHaveValue('19.90');
  expect(screen.getByLabelText('Currency')).toHaveValue('USD');
  expect(screen.getByLabelText('Where to buy')).toHaveValue('https://example.com/original');
  expect(screen.getByLabelText('Key fact name 1')).toHaveValue('Weight');
 });

 // Without rehydration the form starts with no media and saves mediaIds: [], silently
 // detaching every snapshot the owner had uploaded. The thumbnail proves the state is
 // restored; the patch proves the save cannot drop it.
 it('keeps previously uploaded snapshots through a re-edit', async () => {
  const existing = '11111111-2222-3333-4444-555555555555';
  loaded([existing]); vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  expect(await screen.findByAltText('Product photo')).toHaveAttribute('src', `/api/explorers/v1/media/${existing}/content`);
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  expect(vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1]).toMatchObject({mediaIds: [existing]});
 });

 // Snapshots had a picker and a remove button but no order, so the first image uploaded stayed
 // the lead image whatever the owner preferred.
 it('saves snapshots in the order the owner arranged them', async () => {
  const [a, b, c] = ['11111111-2222-3333-4444-555555555551', '11111111-2222-3333-4444-555555555552', '11111111-2222-3333-4444-555555555553'];
  loaded([a, b, c]); vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  await screen.findAllByAltText('Product photo');
  fireEvent.click(screen.getByRole('button', {name: 'Move Photo 3 up'}));
  fireEvent.click(screen.getByRole('button', {name: 'Move Photo 1 down'}));
  expect(screen.getAllByAltText('Product photo').map(image => image.getAttribute('src'))).toEqual([c, a, b].map(id => `/api/explorers/v1/media/${id}/content`));
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  expect(vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1]).toMatchObject({mediaIds: [c, a, b]});
 });

 it('never sends the product URL as a display override', async () => {
  loaded(); vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  fireEvent.change(await screen.findByLabelText('Title'), {target: {value: 'Renamed'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1] as {displayOverrides: Record<string, unknown>; productOffer: unknown};
  expect(patch.displayOverrides).not.toHaveProperty('productUrl');
  expect(patch.displayOverrides.title).toBe('Renamed');
  expect(patch.productOffer).toEqual({price: '19.90', currencyCode: 'USD', buyUrl: 'https://example.com/original', affiliateDisclosed: false});
 });

 // Rows saved before a currency was required hold a price and no currency. They stay
 // readable; saving one asks for the missing currency instead of guessing it.
 it('asks for the currency of a legacy price before it can be saved, and does not guess one', async () => {
  region('en-US');
  loaded();
  fixture.content.details.set('product-a', {detail: {id: 'product-a', revision: 1, category: 'products', mediaIds: [], productOffer: {price: '19.90', currencyCode: null, buyUrl: null}}});
  vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  expect(await screen.findByLabelText('Price')).toHaveValue('19.90');
  expect(await screen.findByRole('alert')).toHaveTextContent('Choose a currency for the price.');
  expect(screen.getByRole('button', {name: 'Save'})).toBeDisabled();
  pickCurrency('GBP');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  expect((vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1] as {productOffer: unknown}).productOffer).toEqual({price: '19.90', currencyCode: 'GBP', buyUrl: 'https://example.com/original', affiliateDisclosed: false});
 });

 it('waits for owner hydration instead of exposing blank editable controls', async () => {
  fixture.loading = true; const view = render(editElement());
  expect(screen.getByRole('status')).toHaveTextContent('Loading product');
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  loaded(); view.rerender(editElement());
  expect(await screen.findByLabelText('Title')).toHaveValue('Original title');
 });

 it('preserves an unsaved edit on a background refresh and refuses to rebase its observation', async () => {
  loaded(); const original = fixture.content.details.get('product-a'); const view = render(editElement());
  fireEvent.change(await screen.findByLabelText('Title'), {target: {value: 'My unsaved edit'}});
  fixture.content = {view: {lists: []}, details: new Map(), observation: {}}; fixture.error = new Error('Refresh unavailable');
  view.rerender(editElement());
  expect(screen.getByLabelText('Title')).toHaveValue('My unsaved edit');
  loaded(); fixture.content.details.set('product-a', {detail: {id: 'product-a', revision: 2, category: 'products', productOffer: {price: '19.90', currencyCode: 'USD', buyUrl: null}}});
  view.rerender(editElement());
  expect(screen.getByLabelText('Title')).toHaveValue('My unsaved edit');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the product before saving');
  expect(ProductsClient.updateRecommendation).not.toHaveBeenCalled();
  expect(fixture.content.details.get('product-a')).not.toBe(original);
 });
});
