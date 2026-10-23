import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {MockedProvider} from '@apollo/client/testing';
import AddProductPage from '../AddProductPage';
import {ProductsClient} from '../../../api/productsClient';
import {linkPreviewClient} from '../../../../../lib/linkPreviewClient';
import useAuthStore from '../../../../../store/store';
import '../../../../../i18n';

// WP8 Task 8-10: one link, product photo from the link, price with its currency, at most
// eight key facts, and an explicit affiliate disclosure.

const fixture = vi.hoisted(() => ({content: {view: {lists: [] as unknown[]}, details: new Map(), observation: {}}, loading: false, error: undefined as Error | undefined, refetch: vi.fn()}));
vi.mock('../../../hooks/useProductsOwner', () => ({useProductsOwner: () => ({content: fixture.content, loading: fixture.loading, error: fixture.error, refetch: fixture.refetch}), invalidateProducts: vi.fn()}));
vi.mock('../../../api/productsClient', () => ({ProductsClient: {observeCollection: vi.fn(), prepareManualIntent: vi.fn(), createManual: vi.fn(), upload: vi.fn(), updateRecommendation: vi.fn()}}));
vi.mock('../../../../../lib/linkPreviewClient', () => ({linkPreviewClient: {preview: vi.fn(), importImage: vi.fn()}}));
vi.mock('../../../../Favorites/components/TiptapEditor', () => ({default: ({value, onChange}: {value: string; onChange: (value: string) => void}) => <textarea aria-label="Note" value={value} onChange={event => onChange(event.target.value)} />}));
vi.mock('sonner', () => ({toast: {success: vi.fn(), error: vi.fn(), loading: vi.fn()}}));

const URL_ = 'https://shop.example/p';
const preview = {url: URL_, title: 'Trail Shoe | Shop', description: 'Light trail shoe', imageUrl: 'https://cdn.shop.example/shoe.jpg', siteName: 'Shop',
 product: {name: 'Trail Shoe', brand: 'Acme', price: '119.90', currencyCode: 'EUR'}, person: null};

function mount() { return render(<MockedProvider><MemoryRouter initialEntries={['/products/list-1/add']}><Routes><Route path="/products/:listId/add" element={<AddProductPage />} /><Route path="/recommendations/products/:listId" element={<p>Saved list</p>} /></Routes></MemoryRouter></MockedProvider>); }
const draft = () => vi.mocked(ProductsClient.prepareManualIntent).mock.calls[0][1] as Record<string, any>;
const paste = (url: string) => {
 const field = screen.getByLabelText('Where to buy');
 fireEvent.change(field, {target: {value: url}});
 fireEvent.paste(field, {clipboardData: {getData: () => url}});
};

describe('Products template', () => {
 beforeEach(() => {
  vi.clearAllMocks(); fixture.content = {view: {lists: []}, details: new Map(), observation: {}};
  useAuthStore.getState().login({id: 'u1', documentId: 'u1', username: 'owner', token: 'fixture'}); useAuthStore.setState({accountId: 'a1'});
  vi.mocked(ProductsClient.observeCollection).mockResolvedValue({detail: {id: 'list-1'}} as never);
  vi.mocked(ProductsClient.prepareManualIntent).mockImplementation((parent, d) => ({parent, draft: d}) as never);
  vi.mocked(ProductsClient.createManual).mockResolvedValue({id: 'product-1'} as never);
  vi.mocked(linkPreviewClient.preview).mockResolvedValue(preview as never);
  vi.mocked(linkPreviewClient.importImage).mockResolvedValue({id: 'media-photo'});
 });
 afterEach(() => { cleanup(); useAuthStore.getState().logout(); });

 it('prefills from the pasted link and marks what it filled', async () => {
  mount(); paste(URL_);
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Trail Shoe'));
  expect(screen.getByLabelText('Brand')).toHaveValue('Acme');
  expect(screen.getByLabelText('Price')).toHaveValue('119.90');
  expect(screen.getByLabelText('Currency')).toHaveValue('EUR');
  expect(screen.getAllByText('Filled from link').length).toBeGreaterThanOrEqual(3);
  expect(linkPreviewClient.preview).toHaveBeenCalledWith(URL_, expect.anything());
 });

 it('has one link field: no logo, product or buy URL fields', () => {
  mount();
  expect(screen.queryByLabelText('Logo URL')).toBeNull();
  expect(screen.queryByLabelText('Product URL')).toBeNull();
  expect(screen.queryByLabelText(/Buy URL|Buy \/ Affiliate URL/)).toBeNull();
  expect(screen.getByLabelText('Where to buy')).toBeInTheDocument();
 });

 it('imports the link photo as the product photo on request', async () => {
  mount(); paste(URL_);
  fireEvent.click(await screen.findByRole('button', {name: 'Use this photo'}));
  await waitFor(() => expect(linkPreviewClient.importImage).toHaveBeenCalledWith('https://cdn.shop.example/shoe.jpg'));
  expect(await screen.findByAltText('Product photo')).toHaveAttribute('src', '/api/explorers/v1/media/media-photo/content');
 });

 it('allows at most 8 key facts', () => {
  mount();
  const add = screen.getByRole('button', {name: '+ Add key fact'});
  for (let i = 0; i < 8; i++) fireEvent.click(add);
  expect(screen.getAllByLabelText(/^Key fact name/)).toHaveLength(8);
  expect(add).toBeDisabled();
 });

 it('starts with the affiliate disclosure off', () => {
  mount();
  expect(screen.getByRole('checkbox', {name: 'This is an affiliate link'})).not.toBeChecked();
 });

 it('saves the one link as both the product and buy link, with the photo first and no logo', async () => {
  mount(); paste(URL_);
  fireEvent.click(await screen.findByRole('button', {name: 'Use this photo'}));
  await screen.findByAltText('Product photo');
  fireEvent.click(screen.getByRole('checkbox', {name: 'This is an affiliate link'}));
  fireEvent.click(screen.getByRole('button', {name: '+ Add key fact'}));
  fireEvent.change(screen.getByLabelText('Key fact name 1'), {target: {value: 'Weight'}});
  fireEvent.change(screen.getByLabelText('Key fact value 1'), {target: {value: '240 g'}});
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await screen.findByText('Saved list');
  expect(draft()).toMatchObject({title: 'Trail Shoe', productUrl: URL_, brand: 'Acme', logoUrl: null, mediaIds: ['media-photo'],
   specifications: [{key: 'Weight', value: '240 g'}], offer: {price: '119.90', currencyCode: 'EUR', buyUrl: URL_, affiliateDisclosed: true}});
 });

 it('shows the stored product link as Where to buy when an old row has no buy link', async () => {
  const product = {documentId: 'product-a', title: 'Old', product_url: 'https://old.example/p', brand: null, buy_url: null, logo_url: 'https://old.example/logo.png',
   description: null, specifications: null, user_recommendation_note: '', user_rating: null};
  fixture.content.view.lists = [{documentId: 'list-1', recommended_products: [product]}];
  fixture.content.details.set('product-a', {detail: {id: 'product-a', revision: 1, category: 'products', mediaIds: [], productOffer: {price: null, currencyCode: null, buyUrl: null, affiliateDisclosed: false}}});
  vi.mocked(ProductsClient.updateRecommendation).mockResolvedValue({} as never);
  render(<MockedProvider><MemoryRouter initialEntries={['/recommendations/products/list-1/edit/product-a']}><Routes><Route path="/recommendations/products/:listId/edit/:productId" element={<AddProductPage />} /></Routes></MemoryRouter></MockedProvider>);
  expect(await screen.findByLabelText('Where to buy')).toHaveValue('https://old.example/p');
  fireEvent.click(screen.getByRole('button', {name: 'Save'}));
  await waitFor(() => expect(ProductsClient.updateRecommendation).toHaveBeenCalledTimes(1));
  const patch = vi.mocked(ProductsClient.updateRecommendation).mock.calls[0][1] as {displayOverrides: Record<string, unknown>; productOffer: Record<string, unknown>};
  expect(patch.displayOverrides.logoUrl).toBeNull();
  expect(patch.displayOverrides).not.toHaveProperty('productUrl');
  expect(patch.productOffer.buyUrl).toBe('https://old.example/p');
 });
});
