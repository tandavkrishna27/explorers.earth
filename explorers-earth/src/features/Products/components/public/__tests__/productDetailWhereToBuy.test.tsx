import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import '../../../../../i18n/index.js';
import ProductDetailModal from '../ProductDetailModal';
import type { RecommendedProduct } from '../../../types';

const product = (overrides: Partial<RecommendedProduct>): RecommendedProduct => ({
  documentId: 'p', product_url: 'https://shop.example/p', title: 'Trail Shoe', brand: null, price: null, currency: null, buy_url: null,
  logo_url: null, description: null, specifications: null, user_recommendation_note: null, user_rating: null, is_pinned: false,
  pin_order: null, display_order: 0, images: null, product_list: null, product_category: null, ...overrides,
} as RecommendedProduct);
const open = (p: RecommendedProduct) => render(<MemoryRouter><ProductDetailModal product={p} open onClose={() => {}} /></MemoryRouter>);

afterEach(cleanup);

describe('product detail (DS-03, DS-14)', () => {
  it('shows one Where to buy link, falling back to the product link on old rows', () => {
    open(product({}));
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName(/Where to buy/);
    expect(links[0]).toHaveAttribute('href', 'https://shop.example/p');
  });

  it('prefers the buy link and notes a disclosed affiliate link', () => {
    open(product({ buy_url: 'https://shop.example/buy', affiliate_disclosed: true }));
    expect(screen.getByRole('link', { name: /Where to buy/ })).toHaveAttribute('href', 'https://shop.example/buy');
    expect(screen.getByText('Affiliate link')).toBeInTheDocument();
  });

  it('shows no affiliate note when not disclosed, no logo, and key facts', () => {
    open(product({ logo_url: 'https://shop.example/logo.png', specification_list: [{ key: 'Weight', value: '240 g' }] }));
    expect(screen.queryByText('Affiliate link')).toBeNull();
    expect(document.querySelector('img[src="https://shop.example/logo.png"]')).toBeNull();
    expect(screen.getByText('Key facts')).toBeInTheDocument();
    expect(screen.getByText('240 g')).toBeInTheDocument();
  });
});
