import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../../../../i18n/index.js';
import ProductCarouselRow from '../ProductCarouselRow';
import ProductDetailModal from '../ProductDetailModal';
import type { ProductList, RecommendedProduct } from '../../../types';

// One formatter everywhere: the currency's own digits, "Free" for zero (never a bare 0),
// nothing for an unknown price, and no USD invented for an unknown currency.
const product = (overrides: Partial<RecommendedProduct>): RecommendedProduct => ({
  documentId: 'p', product_url: 'https://example.com/p', title: 'Gadget', brand: null, price: null, currency: null, buy_url: null,
  logo_url: null, description: null, specifications: null, user_recommendation_note: null, user_rating: null, is_pinned: false,
  pin_order: null, display_order: 0, images: null, product_list: null, product_category: null, ...overrides,
} as RecommendedProduct);

const row = (...products: RecommendedProduct[]) => {
  const list = { documentId: 'l', List_Name: 'Gear', recommended_products: products } as unknown as ProductList;
  return render(<MemoryRouter><ProductCarouselRow list={list} onProductClick={() => {}} onViewAll={() => {}} /></MemoryRouter>);
};

afterEach(async () => { cleanup(); await i18n.changeLanguage('en'); });

describe('product cards', () => {
  it.each([
    [19.9, 'USD', '$19.90'],
    [100, 'JPY', '¥100'],
    [1.25, 'KWD', 'KWD 1.250'],
    [0, 'USD', 'Free'],
    [0, null, 'Free'],
    // Unknown currency: the amount stands alone. It was "$25".
    [25, null, '25'],
  ])('shows %s %s as %s', (price, currency, expected) => {
    row(product({ price, currency }));
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('shows Free, not a bare 0, for a zero price on a list card', () => {
    const { container } = row(product({ price: 0, currency: 'USD' }));
    expect(container.textContent).toContain('Free');
    expect(screen.queryByText('0')).toBeNull();
  });

  it('shows nothing for an unknown price', () => {
    const { container } = row(product({ price: null }));
    expect(container.querySelector('p.font-bold')).toBeNull();
  });

  it('follows the UI language: symbol layout, separators and the word for free', async () => {
    await i18n.changeLanguage('de');
    row(product({ price: 1234.5, currency: 'EUR' }), product({ documentId: 'q', product_url: 'https://example.com/q', title: 'Gift', price: 0, currency: 'EUR' }));
    expect(screen.getByText((text) => text.replace(/\u00A0/g, ' ') === '1.234,50 €')).toBeInTheDocument();
    expect(screen.getByText('Kostenlos')).toBeInTheDocument();
  });
});

describe('product detail', () => {
  it('shows the price in its currency\'s own digits', () => {
    render(<MemoryRouter><ProductDetailModal product={product({ price: 19.9, currency: 'USD' })} open onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByText('$19.90')).toBeInTheDocument();
  });
  it('shows Free for zero', () => {
    render(<MemoryRouter><ProductDetailModal product={product({ price: 0, currency: 'EUR' })} open onClose={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});
