import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddProductPage from '../AddProductPage';
import ProductListView from '../ProductListView';
import {ProductsClient} from '../../../api/productsClient';
import useAuthStore from '../../../../../store/store';

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
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('sends the amount exactly as typed, with its currency', async () => {
  mount();
  fill('Title', 'Keyboard'); fill('Product URL', 'https://example.com/kb');
  fill('Brand', 'Keychron'); fill('Buy / Affiliate URL', 'https://example.com/buy');
  fill('Price', '19.90'); fill('Currency', 'USD');
  fill('Note', '<p>Types nicely</p>');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  // "19.90", not 19.9: the owner's exact decimal reaches the command as a string.
  expect(draft()).toMatchObject({title: 'Keyboard', productUrl: 'https://example.com/kb', brand: 'Keychron',
   offer: {price: '19.90', currencyCode: 'USD', buyUrl: 'https://example.com/buy'}});
 });

 it('treats an empty price as unknown rather than free, and an empty currency as unknown', async () => {
  mount(); fill('Title', 'Unpriced'); fill('Product URL', 'https://example.com/unpriced');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: null, currencyCode: null, buyUrl: null}});
 });

 it('sends a zero price as zero, which is a price and not unknown', async () => {
  mount(); fill('Title', 'Free thing'); fill('Product URL', 'https://example.com/free');
  fill('Price', '0.00'); fill('Currency', 'USD');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '0.00', currencyCode: 'USD'}});
 });

 it('keeps an amount with no currency rather than defaulting to USD', async () => {
  mount(); fill('Title', 'No currency'); fill('Product URL', 'https://example.com/nocur');
  fill('Price', '19.90');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({offer: {price: '19.90', currencyCode: null}});
 });

 // The substance of the retired scraped-price guard: an impossible amount is reported
 // before anything is dispatched, and the draft survives.
 it('refuses a malformed amount without dispatching, and keeps the draft', async () => {
  mount(); fill('Title', 'Bad price'); fill('Product URL', 'https://example.com/bad');
  fill('Price', '$19.90');
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter an amount like 19.90');
  expect(screen.getByRole('button', {name: 'Save product'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  expect(ProductsClient.observeCollection).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Price')).toHaveValue('$19.90');
  expect(screen.getByLabelText('Title')).toHaveValue('Bad price');
 });

 it('refuses a precision the chosen currency does not have, and recovers when it changes', async () => {
  mount(); fill('Title', 'Yen'); fill('Product URL', 'https://example.com/yen');
  fill('Price', '100.50'); fill('Currency', 'JPY');
  expect(await screen.findByRole('alert')).toHaveTextContent('JPY does not have that many decimal places');
  expect(screen.getByRole('button', {name: 'Save product'})).toBeDisabled();
  fill('Currency', 'USD');
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save product'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
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

 it('offers only supported currencies, with unknown as the default', () => {
  mount();
  const options = [...(screen.getByLabelText('Currency') as HTMLSelectElement).options].map(option => option.value);
  expect(options[0]).toBe('');
  expect(options.slice(1)).toEqual(['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'SGD']);
  expect(screen.getByLabelText('Currency')).toHaveValue('');
 });

 it('round-trips the specification map the owner entered', async () => {
  mount(); fill('Title', 'Specced'); fill('Product URL', 'https://example.com/specced');
  fireEvent.click(screen.getByRole('button', {name: 'Add specification'}));
  fill('Specification key 1', 'Weight'); fill('Specification value 1', '1kg');
  fireEvent.click(screen.getByRole('button', {name: 'Add specification'}));
  fill('Specification key 2', 'Colour'); fill('Specification value 2', 'Black');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({specifications: {Weight: '1kg', Colour: 'Black'}});
 });

 it('refuses to save without the product URL its storage requires', () => {
  mount(); fill('Title', 'No link');
  expect(screen.getByRole('button', {name: 'Save product'})).toBeDisabled();
  expect(ProductsClient.observeCollection).not.toHaveBeenCalled();
 });

 it('waits for uploaded snapshot readiness before saving', async () => {
  const upload = deferred<{id: string}>(); vi.mocked(ProductsClient.upload).mockReturnValue(upload.promise as never);
  mount(); fill('Title', 'Shot'); fill('Product URL', 'https://example.com/shot');
  fireEvent.change(screen.getByLabelText('Snapshots'), {target: {files: [new File(['bytes'], 'shot.png', {type: 'image/png'})]}});
  expect(screen.getByRole('button', {name: 'Save product'})).toBeDisabled();
  await act(async () => upload.resolve({id: 'media-1'}));
  await waitFor(() => expect(screen.getByRole('button', {name: 'Save product'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({mediaIds: ['media-1']});
 });

 it('preserves every typed field when the save fails and retries the same intent', async () => {
  vi.mocked(ProductsClient.createManual).mockRejectedValueOnce(new Error('Temporarily unavailable')).mockResolvedValueOnce({id: 'product-1'} as never);
  mount(); fill('Title', 'Retained'); fill('Product URL', 'https://example.com/retained'); fill('Price', '5.00'); fill('Currency', 'EUR');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Title')).toHaveValue('Retained');
  expect(screen.getByLabelText('Price')).toHaveValue('5.00');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await screen.findByText('Saved list');
  expect(ProductsClient.prepareManualIntent).toHaveBeenCalledTimes(1);
  expect(vi.mocked(ProductsClient.createManual).mock.calls[0][0]).toBe(vi.mocked(ProductsClient.createManual).mock.calls[1][0]);
 });

 it('cannot create a product once the account is replaced while the parent read is pending', async () => {
  const parent = deferred<never>(); vi.mocked(ProductsClient.observeCollection).mockReturnValue(parent.promise);
  mount(); fill('Title', 'Old owner'); fill('Product URL', 'https://example.com/old');
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  act(() => useAuthStore.getState().logout());
  await act(async () => parent.resolve({detail: {id: 'list-1'}} as never));
  expect(ProductsClient.prepareManualIntent).not.toHaveBeenCalled();
  expect(ProductsClient.createManual).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveValue('');
 });

 it('offers explicit recommendation publication without inheriting the list publication', async () => {
  const product = {documentId: 'product-a', title: 'Manual product', product_url: 'https://example.com/a', brand: null, price: null, currency: null,
   buy_url: null, logo_url: null, description: null, specifications: null, user_recommendation_note: '', user_rating: null, is_pinned: false,
   pin_order: null, display_order: 0, images: null, product_list: {documentId: 'list-1', List_Name: 'Published list', slug: 'published'}, product_category: null};
  fixture.content.view.lists = [{documentId: 'list-1', List_Name: 'Published list', slug: 'published', Visibility: true, recommended_products: [product], account: {documentId: 'a1', username: 'owner'}}];
  const observed = {detail: {id: 'product-a', revision: 1, publicationState: 'draft', category: 'products'}};
  fixture.content.details.set('product-a', observed);
  vi.mocked(ProductsClient.observeRecommendation).mockResolvedValue(observed as never);
  vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1']}><Routes><Route path="/recommendations/products/:listId" element={<ProductListView />} /></Routes></MemoryRouter></MockedProvider>);
  expect(screen.getByText('Recommendation is Draft')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Publish Manual product'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledWith(observed, {publicationState: 'published'}, expect.any(String), expect.any(AbortSignal)));
  expect(ProductsClient.updateCollection).not.toHaveBeenCalled();
 });
});

describe('manual Products edit', () => {
 function editElement() { return <MockedProvider><MemoryRouter initialEntries={['/products/list-1/edit/product-a']}><Routes><Route path="/products/:listId/edit/:productId" element={<AddProductPage />} /></Routes></MemoryRouter></MockedProvider>; }
 function loaded() {
  const product = {documentId: 'product-a', title: 'Original title', product_url: 'https://example.com/original', brand: 'Acme', price: 19.9,
   currency: 'USD', buy_url: null, logo_url: null, description: null, specifications: {Weight: '1kg'}, user_recommendation_note: '<p>Note</p>',
   user_rating: 8, images: null, is_pinned: false, pin_order: null, display_order: 0, product_list: null, product_category: null};
  fixture.content.view.lists = [{documentId: 'list-1', recommended_products: [product]}];
  fixture.content.details.set('product-a', {detail: {id: 'product-a', revision: 1, category: 'products', productOffer: {price: '19.90', currencyCode: 'USD', buyUrl: null}}});
  fixture.content = {...fixture.content}; fixture.loading = false; fixture.error = undefined;
 }
 beforeEach(() => { vi.clearAllMocks(); fixture.content = {view: {lists: []}, details: new Map(), observation: {}}; fixture.loading = false; fixture.error = undefined; useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'}); });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('hydrates the exact stored amount rather than the display number, and locks the shared URL', async () => {
  loaded(); render(editElement());
  expect(await screen.findByLabelText('Title')).toHaveValue('Original title');
  // 19.90 from the observation, not 19.9 from the display conversion.
  expect(screen.getByLabelText('Price')).toHaveValue('19.90');
  expect(screen.getByLabelText('Currency')).toHaveValue('USD');
  expect(screen.getByLabelText('Product URL')).toHaveValue('https://example.com/original');
  expect(screen.getByLabelText('Product URL')).toBeDisabled();
  expect(screen.getByLabelText('Specification key 1')).toHaveValue('Weight');
 });

 it('never sends the product URL as a display override', async () => {
  loaded(); vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(editElement());
  fireEvent.change(await screen.findByLabelText('Title'), {target: {value: 'Renamed'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1] as {displayOverrides: Record<string, unknown>; productOffer: unknown};
  expect(patch.displayOverrides).not.toHaveProperty('productUrl');
  expect(patch.displayOverrides.title).toBe('Renamed');
  expect(patch.productOffer).toEqual({price: '19.90', currencyCode: 'USD', buyUrl: null});
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
  fireEvent.click(screen.getByRole('button', {name: 'Save product'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Reload the product before saving');
  expect(ProductsClient.updateRecommendation).not.toHaveBeenCalled();
  expect(fixture.content.details.get('product-a')).not.toBe(original);
 });
});
