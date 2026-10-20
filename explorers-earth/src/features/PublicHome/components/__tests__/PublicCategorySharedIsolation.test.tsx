import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forwardRef, type ComponentType, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MovieDetailModal from '../../../Movies/components/public/MovieDetailModal';
import BookDetailModal from '../../../Books/components/public/BookDetailModal';
import GameDetailModal from '../../../Games/components/public/GameDetailModal';
import AppDetailModal from '../../../AppsAndTools/components/public/AppDetailModal';
import ProductDetailModal from '../../../Products/components/public/ProductDetailModal';
import PersonDetailModal from '../../../People/components/public/PersonDetailModal';
import { PublicCategoryThemeProvider } from '../PublicCategoryThemeContext';
import HeroSkeleton from '../../../../components/ui/HeroSkeleton';
import TopReadsHero from '../../../Books/components/public/TopReadsHero';
import TopReadsMobileHero from '../../../Books/components/public/TopReadsMobileHero';
import TopGamesHero from '../../../Games/components/public/TopGamesHero';
import TopPicksHero from '../../../Movies/components/public/TopPicksHero';
import Modal from '../../../../components/ui/Modal';
import Button from '../../../../components/ui/Button';
import SwitchButton from '../../../../components/ui/SwitchButton';
import RecommendationCardSkeleton from '../../../../components/ui/RecommendationCardSkeleton';
import GuideCardSkeleton from '../../../../components/ui/GuideCardSkeleton';
import ShareModal from '../../../../components/ShareModal';
import QRModal from '../../../../components/ui/QRModal';
import Tab from '../../../../components/ui/Tab';
import Card from '../../../../components/ui/Card';
import CircularPlacesModal from '../../../../components/CircularPlacesModal';
import PlaceContentOverview from '../PlaceDetails/Details/Overview';
import DayNavigationView from '../PublicGuideViews/DayNavigationView';
import PublicGuideDetailPage from '../PublicGuideDetailPage';
import PublicGuideTipsView from '../PublicGuideViews/PublicGuideTipsView';
import PublicGuideBudgetView from '../PublicGuideViews/PublicGuideBudgetView';
import PublicGuideTransportView from '../PublicGuideViews/PublicGuideTransportView';
import PublicGuideStayView from '../PublicGuideViews/PublicGuideStayView';
import GuideMapView from '../PublicGuideViews/GuideMapView';

vi.mock('../../../../utils/getCurrentLocation', () => ({ getCurrentLocation: async () => null }));
vi.mock('../../api/usePublicProfileShell', () => ({
  usePublicProfileShell: () => ({ loading: false, error: null, refetch: async () => {} }),
}));
vi.mock('../../api/usePublicProfileDetail', () => ({
  usePublicProfileDetail: () => ({
    data: {
      guides: [{
        documentId: 'guide-1',
        Title: 'Fixture Guide',
        Guide_Media: [],
        guide_sections: [{
          documentId: 'day-1',
          Sequence: 1,
          Title: 'Day 1: Old Town',
          // Canonical guideDayPlaceSchema entry, which is what the native projection
          // emits (tunes/server/publicProfile/publicGuidesProjection.ts:57 -> data.timeline).
          // convertPublicGuideSection skips a place that is neither canonical nor a complete
          // legacy DayPlace (it used to drop the whole section), so this fixture carries the
          // real shape -- otherwise this place would simply be absent from the rendered day.
          Timeline: { morning: [{
            localId: 'place-1',
            placeId: 'place-1',
            name: 'Museum',
            formattedAddress: null,
            geometry: null,
            types: [],
            tips: null,
            photos: [],
            priceLevel: null,
            priceRange: null,
            customBudget: null,
            budgetAmount: null,
            budgetCurrency: null,
            source: 'manual',
            verified: true,
          }] },
        }],
      }],
    },
    loading: false,
    error: null,
    refetch: async () => {},
    hasMore: false,
    loadMoreError: null,
    loadingMore: false,
    loadMore: async () => {},
  }),
}));
vi.mock('../PublicHeaderDescriptorContext', () => ({ usePublicHeaderDescriptor: () => {} }));
vi.mock('../../../../components/SEO', () => ({ default: () => null }));
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  AdvancedMarker: forwardRef<HTMLDivElement, { children?: ReactNode; onClick?: (event: unknown) => void }>(
    ({ children, onClick }, ref) => <div ref={ref} data-testid="mock-guide-marker" onClick={onClick as any}>{children}</div>,
  ),
  Map: ({ children }: { children?: ReactNode }) => <div data-testid="mock-guide-map">{children}</div>,
  Pin: () => <span aria-hidden="true" />,
  useMap: () => null,
  useApiIsLoaded: () => true,
}));
// Maps counts as usable only when the marker library is present.
(window as unknown as { google: unknown }).google = { maps: { marker: { AdvancedMarkerElement: class {} } } };

it('uses category primary text for Guide Day labels while preserving the blue fallback and accent bar', () => {
  const sections = [{
    documentId: 'day-1',
    Sequence: 1,
    Title: 'Day 1: Old Town',
    Timeline: { morning: [{ place_id: 'place-1', name: 'Museum' }] },
  }];

  const { container } = render(<DayNavigationView sections={sections} guide={{}} />);

  expect(screen.getByText('Day 1')).toHaveClass('text-[var(--category-text,hsl(var(--blue-cta)))]');
  expect(container.querySelector('.w-1.h-8')).toHaveClass(
    'from-[var(--category-accent,hsl(var(--blue-cta)))]',
    'to-[var(--category-accent,hsl(var(--blue-final)))]',
  );
});

it('keeps Guide emphasis readable and limits Read More focus treatment to category context', () => {
  const sections = [{
    documentId: 'day-1',
    Sequence: 1,
    Title: 'Day 1: Old Town',
    Timeline: { morning: [{ place_id: 'place-1', name: 'Museum' }] },
  }];
  const guide = { Description: 'A'.repeat(301), Place_Details: { Place_Name: 'Lisbon' } };
  const view = (category: boolean, selectedDay = 'overview') => (
    <PublicCategoryThemeProvider styles={category ? { '--category-text': '#ECFDF5', '--category-focus': '#34D399' } : null}>
      <DayNavigationView sections={sections} guide={guide} selectedDay={selectedDay} />
    </PublicCategoryThemeProvider>
  );
  const { rerender } = render(view(true));

  expect(screen.getByText('About This Journey')).toHaveClass(
    'from-[var(--category-text,hsl(var(--blue-cta)))]',
    'via-[var(--category-text,hsl(var(--blue-cta)))]',
    'to-[var(--category-text,hsl(var(--blue-final)))]',
  );
  expect(screen.getByRole('button', { name: 'Read More' })).toHaveClass(
    'text-[var(--category-text,hsl(var(--blue-cta)))]',
    'hover:text-[var(--category-text,hsl(var(--blue-final)))]',
    'focus-visible:!outline',
    'focus-visible:!outline-2',
    'focus-visible:!outline-offset-2',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );

  rerender(view(true, 'day-1'));
  expect(screen.getByText('Lisbon')).toHaveClass(
    'from-[var(--category-text,hsl(var(--blue-cta)))]',
    'via-[var(--category-text,hsl(var(--blue-cta)))]',
    'to-[var(--category-text,hsl(var(--blue-final)))]',
  );

  rerender(view(false));
  expect(screen.getByRole('button', { name: 'Read More' })).not.toHaveClass(
    'focus-visible:!outline',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );
});

it('uses readable Guide navigation ink and category-only focus without changing control semantics', () => {
  const view = (category: boolean) => (
    <PublicCategoryThemeProvider styles={category ? { '--category-text': '#ECFDF5', '--category-focus': '#34D399' } : null}>
      <MemoryRouter initialEntries={['/alice/guides/fixture-guide']}>
        <Routes>
          <Route path="/:username/guides/:guideSlug" element={<PublicGuideDetailPage />} />
        </Routes>
      </MemoryRouter>
    </PublicCategoryThemeProvider>
  );
  const { rerender } = render(view(true));

  expect(screen.getByText('Journey', { selector: 'p' })).toHaveClass('text-[var(--category-text,#60A5FA)]');
  const categoryDay = screen.getByRole('button', { name: 'Day 1' });
  expect(categoryDay).toHaveClass(
    'text-[var(--category-text,#3B82F6)]',
    'hover:text-[var(--category-text,#60A5FA)]',
    'focus-visible:!outline',
    'focus-visible:!outline-2',
    'focus-visible:!outline-offset-2',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );
  expect(categoryDay).not.toHaveAttribute('role');
  expect(categoryDay).not.toHaveAttribute('tabindex');

  rerender(view(false));
  const neutralDay = screen.getByRole('button', { name: 'Day 1' });
  expect(neutralDay).not.toHaveClass(
    'focus-visible:!outline',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );
});

it('uses primary category ink for the repeated Guide view day and budget labels', () => {
  const timeline = {
    morning: [
      { place_id: 'from', name: 'Station', tips: 'T'.repeat(201) },
      { place_id: 'to', name: 'Museum' },
    ],
  };
  const section = {
    documentId: 'day-1',
    Sequence: 1,
    Title: 'Day 1: Old Town',
    Timeline: timeline,
    Transport: { segments: [{ fromPlaceId: 'from', toPlaceId: 'to', mode: 'walk' }] },
    Stay: { accommodations: [{ place_id: 'hotel', name: 'Hotel' }] },
    Budget: { morning: [{ name: 'Cafe', budgetAmount: 10, budgetCurrency: 'USD' }] },
  };
  const gradientClasses = [
    'from-[var(--category-text,hsl(var(--blue-cta)))]',
    'via-[var(--category-text,hsl(var(--blue-cta)))]',
    'to-[var(--category-text,hsl(var(--blue-final)))]',
  ];

  const { rerender } = render(<PublicGuideTransportView sections={[section]} selectedDay="overview" />);
  expect(screen.getByText('Day 1')).toHaveClass(...gradientClasses);
  rerender(<PublicGuideTransportView sections={[section]} selectedDay="day-1" />);
  expect(screen.getByText('Day 1')).toHaveClass(...gradientClasses);

  rerender(<PublicGuideStayView sections={[section]} guide={{}} selectedDay="overview" />);
  expect(screen.getByText('Day 1')).toHaveClass(...gradientClasses);
  rerender(<PublicGuideStayView sections={[section]} guide={{}} selectedDay="day-1" />);
  expect(screen.getByText('Day 1')).toHaveClass(...gradientClasses);

  rerender(<PublicGuideTipsView sections={[section]} guide={{}} />);
  expect(screen.getByText('Day 1')).toHaveClass('text-[var(--category-text,hsl(var(--blue-cta)))]');

  rerender(<PublicGuideBudgetView sections={[section]} guide={{}} />);
  for (const label of ['Day & Title', 'Place / Activity', 'Amount']) {
    expect(screen.getByText(label)).toHaveClass(...gradientClasses);
  }
  expect(screen.getByText('1')).toHaveClass('text-[var(--category-text,#60A5FA)]');
});

it('uses readable Tips expansion ink and category-only focus without changing handlers', () => {
  const sections = [{
    documentId: 'day-1',
    Sequence: 1,
    Timeline: { morning: [{ name: 'Museum', tips: 'T'.repeat(201) }] },
  }];
  const view = (category: boolean) => (
    <PublicCategoryThemeProvider styles={category ? { '--category-text': '#ECFDF5', '--category-focus': '#34D399' } : null}>
      <PublicGuideTipsView guide={{ Tips_Notes: 'M'.repeat(401) }} sections={sections} />
    </PublicCategoryThemeProvider>
  );
  const { rerender } = render(view(true));

  for (const button of screen.getAllByRole('button', { name: 'See More' })) {
    expect(button).toHaveClass(
      'text-[var(--category-text,hsl(var(--blue-cta)))]',
      'hover:text-[var(--category-text,hsl(var(--blue-final)))]',
      'focus-visible:!outline',
      'focus-visible:!outline-2',
      'focus-visible:!outline-offset-2',
      'focus-visible:!outline-[var(--category-focus)]',
      'focus-visible:!transform-none',
    );
    fireEvent.click(button);
  }
  expect(screen.getAllByRole('button', { name: 'See Less' })).toHaveLength(2);

  rerender(view(false));
  for (const button of screen.getAllByRole('button', { name: 'See Less' })) {
    expect(button).not.toHaveClass(
      'focus-visible:!outline',
      'focus-visible:!outline-[var(--category-focus)]',
      'focus-visible:!transform-none',
    );
  }
});

it('keeps map control and link class/style contracts scoped to category context', () => {
  const sections = [{
    Sequence: 1,
    Timeline: { morning: [{ place_id: 'place-1', name: 'Museum', geometry: { location: { lat: 38.7, lng: -9.1 } } }] },
  }];
  const view = (category: boolean) => (
    <PublicCategoryThemeProvider styles={category ? { '--category-text': '#ECFDF5', '--category-focus': '#34D399' } : null}>
      <GuideMapView sections={sections} guide={{}} isMapView onCloseMap={() => {}} />
    </PublicCategoryThemeProvider>
  );
  const controlNames = ['Collapse cards', 'Expand map'];
  const { rerender } = render(view(false));
  const originalControls = Object.fromEntries(controlNames.map(name => {
    const control = screen.getByRole('button', { name });
    return [name, { className: control.className, style: control.getAttribute('style') }];
  }));

  const marker = screen.getByTestId('mock-guide-map').querySelector('[data-testid="mock-guide-marker"]');
  expect(marker).not.toBeNull();
  fireEvent.click(marker!);
  const originalLink = screen.getByRole('link', { name: 'View on Google Maps' });
  const originalLinkPresentation = { className: originalLink.className, style: originalLink.getAttribute('style') };

  rerender(view(true));

  for (const name of controlNames) {
    expect(screen.getByRole('button', { name })).toHaveClass(
      'focus-visible:!outline',
      'focus-visible:!outline-2',
      'focus-visible:!outline-offset-2',
      'focus-visible:!outline-[var(--category-focus)]',
      'focus-visible:!transform-none',
    );
  }

  const link = screen.getByRole('link', { name: 'View on Google Maps' });
  expect(link).toHaveClass(
    'text-[var(--category-text,#2563EB)]',
    'hover:text-[var(--category-text,#1D4ED8)]',
    'focus-visible:!outline',
    'focus-visible:!outline-2',
    'focus-visible:!outline-offset-2',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );
  expect(screen.getByRole('button', { name: 'Close' })).toHaveClass(
    'focus-visible:!outline',
    'focus-visible:!outline-[var(--category-focus)]',
    'focus-visible:!transform-none',
  );

  rerender(view(false));
  for (const name of controlNames) {
    const control = screen.getByRole('button', { name });
    expect({ className: control.className, style: control.getAttribute('style') }).toEqual(originalControls[name]);
  }
  const restoredLink = screen.getByRole('link', { name: 'View on Google Maps' });
  expect({ className: restoredLink.className, style: restoredLink.getAttribute('style') }).toEqual(originalLinkPresentation);
});

it('renders no phone control without a number', () => {
  const Overview = PlaceContentOverview as ComponentType<any>;
  render(<Overview fetchedPlace={{ Place_Details: {}, Contact_Number: '' }} isPublicCategory />);
  expect(screen.queryByText('Call')).toBeNull();
});

it.each([true])('keeps phone enabled=%s semantics and opts only category glyph into readable ink', enabled => {
  const Overview = PlaceContentOverview as ComponentType<any>;
  const place = { Place_Details: {}, Contact_Number: enabled ? '123456' : '' };
  const { rerender } = render(<Overview fetchedPlace={place} />);
  const phone = () => screen.getByText('Call').parentElement!.querySelector('button')!;
  const originalClass = phone().className;
  expect(phone().querySelector('path')).toHaveAttribute('fill', 'white');
  expect(phone().disabled).toBe(!enabled);
  rerender(<Overview fetchedPlace={place} isPublicCategory />);
  expect(phone()).toHaveClass('[&_svg_path]:fill-[var(--category-text)]');
  expect(phone().disabled).toBe(!enabled);
  rerender(<Overview fetchedPlace={place} />);
  expect(phone().className).toBe(originalClass);
});

it.each([
  ['icon', 'p-2'], ['secondary', 'border'], ['purpleText', 'border'],
] as const)('preserves mapped %s geometry in category Button', (variant, geometry) => {
  const view = (category: boolean, disabled: boolean) => <PublicCategoryThemeProvider styles={category ? { '--category-text': '#0F172A' } : null}><div className="dashboard-theme"><Button variant={variant} btnText="Geometry" disabled={disabled} /></div></PublicCategoryThemeProvider>;
  const { rerender } = render(view(false, false));
  rerender(view(false, true));
  expect(screen.getByRole('button', { name: 'Geometry' })).toHaveClass(geometry);
  rerender(view(true, false));
  expect(screen.getByRole('button', { name: 'Geometry' })).toHaveClass(geometry);
});

it('keeps circular places defaults and themes its ordinary panel only in categories', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const modal = <CircularPlacesModal isOpen onClose={() => {}} places={[]} handleCitySelect={() => {}} />;
  const { rerender } = render(modal);
  expect(screen.getByText('dashboard.recommendations.placesModal.placesCount')).toHaveClass('text-white');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-panel': '#FFFFFF' }}>{modal}</PublicCategoryThemeProvider>);
  expect(screen.getByText('dashboard.recommendations.placesModal.placesCount')).toHaveClass('text-[var(--category-text)]');
  expect(document.querySelector('[data-category-circular-places]')).toHaveClass('bg-[var(--category-panel)]');
});

it('keeps ShareModal inline defaults and preserves its QR quiet zone under category styling', () => {
  const modal = <ShareModal isOpen onClose={() => {}} url="https://example.test/share" shareButtons={[]} qrCategory="places" />;
  const { rerender } = render(modal);
  expect(screen.getByRole('button', { name: 'Share', exact: true }).style.color).toBe('rgb(255, 255, 255)');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-panel': '#FFFFFF', '--category-text': '#0F172A' }}>{modal}</PublicCategoryThemeProvider>);
  expect(screen.getByRole('button', { name: 'Share', exact: true }).style.color).toBe('var(--category-accent-ink)');
  fireEvent.click(screen.getByRole('button', { name: 'QR', exact: true }));
  expect(document.querySelector('#qr-sticker-container')).toHaveClass('bg-black', 'text-white');
  expect(document.querySelector('#qr-sticker-container .p-2')).toHaveClass('bg-white');
  expect(screen.getByText('qrCard.tagline.places')).toHaveClass('text-black');
});

it('themes the QR modal panel while retaining its white quiet zone and default overlay ink', () => {
  const modal = <QRModal isOpen onClose={() => {}} onCopyLink={() => {}} qrValue="https://example.test/qr" title="Profile QR" />;
  const { rerender } = render(modal);
  expect(screen.getByRole('heading', { name: 'Profile QR' })).toHaveClass('text-white');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-panel': '#FFFFFF' }}>{modal}</PublicCategoryThemeProvider>);
  expect(screen.getByRole('heading', { name: 'Profile QR' })).toHaveClass('text-[var(--category-text)]');
  expect(document.querySelector('.bg-white.p-4')).toBeInTheDocument();
});

it('keeps Tab default classes and category public metadata readable', () => {
  const { container, rerender } = render(<Tab tabs={{ Overview: 'Content', Media: 'Media' }} type="public-profile" />);
  expect(screen.getByRole('button', { name: 'Media' })).toHaveClass('text-[var(--text-secondary)]');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-muted': '#475569' }}><Tab tabs={{ Overview: 'Content', Media: 'Media' }} type="public-profile" /></PublicCategoryThemeProvider>);
  expect(screen.getByRole('button', { name: 'Media' })).toHaveClass('text-[var(--category-muted)]');
  expect(container.querySelector('[data-tab-surface="public-profile"]')).toBeInTheDocument();
});

it('preserves public Tab selection and exact null classes across category opt-in', () => {
  const view = (category: boolean) => <PublicCategoryThemeProvider styles={category ? { '--category-panel': '#FFFFFF', '--category-text': '#0F172A' } : null}><Tab tabs={{ Overview: 'Overview content', Media: 'Media content' }} type="public" /></PublicCategoryThemeProvider>;
  const { rerender } = render(view(false));
  fireEvent.click(screen.getByRole('button', { name: 'Media', exact: true }));
  const strip = () => screen.getByRole('button', { name: 'Media', exact: true }).parentElement!;
  const originalStrip = strip().className;
  const originalButtons = [...strip().children].map(button => button.className);
  rerender(view(true));
  expect(screen.getByText('Media content')).toBeVisible();
  expect(strip()).toHaveClass('bg-[var(--category-panel)]');
  expect(strip()).not.toHaveClass('border');
  fireEvent.click(screen.getByRole('button', { name: 'Overview', exact: true }));
  expect(screen.getByText('Overview content')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Media', exact: true }));
  rerender(view(false));
  expect(strip().className).toBe(originalStrip);
  expect([...strip().children].map(button => button.className)).toEqual(originalButtons);
});

it('keeps Card marker, dashboard accent badge and image-overlay text intact as a negative control', () => {
  const { container, rerender } = render(<Card title="Overlay title" numberOfDays={2} />);
  expect(container.firstElementChild).toHaveClass('white-theme');
  expect(screen.getByText('2 Days').parentElement).toHaveClass('bg-dashboard-accent/90', 'text-white');
  const original = screen.getByText('Overlay title').className;
  rerender(<PublicCategoryThemeProvider styles={{ '--category-text': '#0F172A' }}><Card title="Overlay title" numberOfDays={2} /></PublicCategoryThemeProvider>);
  expect(screen.getByText('Overlay title').className).toBe(original);
});

it('keeps dashboard Button mapping and enables category selected-control ink', () => {
  const { rerender } = render(<div className="dashboard-theme"><Button variant="primary" btnText="Open" /></div>);
  rerender(<div className="dashboard-theme"><Button variant="primary" btnText="Open" disabled={false} /></div>);
  expect(screen.getByRole('button', { name: 'Open' })).toHaveClass('dt-button-text', 'bg-dashboard-accent', 'text-white');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-accent': '#0F172A' }}><Button variant="tagSelected" btnText="Open" /></PublicCategoryThemeProvider>);
  expect(screen.getByRole('button', { name: 'Open' })).toHaveClass('text-[var(--category-accent-ink)]');
});

it('keeps switch defaults while opting category controls into their accent', () => {
  const { container, rerender } = render(<SwitchButton isChecked onChange={() => {}} />);
  expect(container.querySelector('label > div')).toHaveClass('bg-white');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-accent': '#0F172A' }}><SwitchButton isChecked onChange={() => {}} /></PublicCategoryThemeProvider>);
  expect(container.querySelector('label > div')).toHaveStyle({ backgroundColor: 'var(--category-accent)' });
});

it.each([RecommendationCardSkeleton, GuideCardSkeleton])('themes public skeleton surfaces without changing the dashboard variant', Skeleton => {
  const { container, rerender } = render(<Skeleton count={1} variant="dashboard" />);
  const before = (container.querySelector('.skeleton-card') as HTMLElement).style.background;
  rerender(<PublicCategoryThemeProvider styles={{ '--category-card': '#FFFFFF' }}><Skeleton count={1} variant="dashboard" /></PublicCategoryThemeProvider>);
  expect((container.querySelector('.skeleton-card') as HTMLElement).style.background).toBe(before);
  rerender(<PublicCategoryThemeProvider styles={{ '--category-card': '#FFFFFF' }}><Skeleton count={1} variant="public" /></PublicCategoryThemeProvider>);
  expect((container.querySelector('.skeleton-card') as HTMLElement).style.background).toBe('var(--category-card)');
});

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
beforeEach(() => { HTMLElement.prototype.scrollIntoView = () => {}; vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); HTMLElement.prototype.scrollIntoView = originalScrollIntoView; vi.restoreAllMocks(); });
const item = {
  documentId: 'fixture-item', title: 'Fixture title', name: 'Fixture title', full_name: 'Fixture title',
  tmdb_id: '1', volume_id: '1', igdb_id: 1, media_type: 'Movie', original_title: 'Fixture title',
  year: '2026', release_year: '2026', poster_path: null, backdrop_path: null, cover_url: null,
  cover_url_large: null, logo_url: null, avatar_url: null, avatar_path: null,
  authors: ['Fixture Author'], developer: 'Fixture Developer', description: 'Fixture description',
  summary: 'Fixture description', overview: 'Fixture description', bio: 'Fixture description',
  subtitle: null, genres: [], subjects: [], platforms: [], watch_providers: [], cast_details: [],
  buy_links: [], screenshots: [], images: [], Media: [], media_details: null,
  tags: [], skills_tags: [], social_urls: {}, platform: null, handle: null, headline: null,
  user_rating: null, user_recommendation_note: null, is_pinned: false, pin_order: null,
  product_url: 'https://example.test/product', app_url: 'https://example.test/app',
  specifications: {}, price: null, brand: null, currency: 'USD',
};
const cases: [string, ComponentType<any>, string][] = [
  ['Movies', MovieDetailModal, 'movie'], ['Books', BookDetailModal, 'book'],
  ['Games', GameDetailModal, 'game'], ['Apps', AppDetailModal, 'app'],
  ['Products', ProductDetailModal, 'product'], ['People', PersonDetailModal, 'person'],
];

it('isolates the shared Modal category panel and body palette from dashboard defaults', () => {
  const { rerender } = render(<Modal isOpen onClose={() => {}}><h2>Shared dialog</h2></Modal>);
  const defaultRoot = screen.getByRole('heading', { name: 'Shared dialog' }).closest('.dashboard-theme') as HTMLElement;
  expect(defaultRoot).toHaveClass('bg-dashboard-overlay');
  const defaultWrapper = defaultRoot.querySelector('[data-modal-wrapper]') as HTMLElement;
  const defaultPanel = defaultRoot.querySelector('[data-modal-panel]') as HTMLElement;
  expect(defaultWrapper).toHaveClass('min-w-0', 'max-w-full');
  expect(defaultPanel).toHaveClass('bg-dashboard-sidebar', 'border-gray-600');
  expect(defaultPanel.style.minWidth).toBe('0px');
  expect(defaultPanel.style.maxWidth).toBe('100%');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-panel': '#FFFFFF', '--category-text': '#0F172A' }}><Modal isOpen onClose={() => {}}><h2>Shared dialog</h2></Modal></PublicCategoryThemeProvider>);
  const root = document.querySelector<HTMLElement>('[data-category-modal]')!;
  expect(root).not.toBeNull();
  expect(root.style.getPropertyValue('--category-panel')).toBe('#FFFFFF');
  expect(root).not.toHaveClass('dashboard-theme');
  expect(root.querySelector('[data-modal-wrapper]')).toHaveClass('min-w-0', 'max-w-full');
  expect((root.querySelector('[data-modal-panel]') as HTMLElement).style.minWidth).toBe('0px');
  expect((root.querySelector('[data-modal-panel]') as HTMLElement).style.maxWidth).toBe('100%');
});

it.each([
  ['Books desktop', TopReadsHero, { books: [item], onBookClick: () => {} }],
  ['Books mobile', TopReadsMobileHero, { books: [item], onBookClick: () => {} }],
  ['Games desktop', TopGamesHero, { games: [item], onGameClick: () => {} }],
  ['Movies desktop', TopPicksHero, { movies: [item], onMovieClick: () => {} }],
] as const)('%s preserves the dashboard accent descendant contract outside category context', (_name, Hero, props) => {
  const Component = Hero as ComponentType<any>;
  const { rerender } = render(<Component {...props} showManageButton onManageClick={() => {}} />);
  expect(screen.getByRole('button', { name: /Manage Top (Reads|Picks)/ })).toHaveClass('bg-dashboard-accent');
  rerender(<PublicCategoryThemeProvider styles={{ '--category-accent': '#0F172A', '--category-accent-ink': '#FFFFFF' }}><Component {...props} showManageButton onManageClick={() => {}} /></PublicCategoryThemeProvider>);
  expect(screen.getByRole('button', { name: /Manage Top (Reads|Picks)/ })).not.toHaveClass('bg-dashboard-accent');
});

describe.each(cases)('%s shared modal category isolation', (_name, Modal, prop) => {
  it('copies category appearance onto the actual panel while preserving neutral defaults without context', () => {
    const styles = { '--category-page': '#F8FAFC', '--category-panel': '#FFFFFF', '--category-text': '#0F172A' };
    const { rerender } = render(<Modal {...{ [prop]: item }} open onClose={() => {}} />);
    const originalPanel = screen.getByRole('heading', { name: 'Fixture title' }).closest('.overflow-y-auto') as HTMLElement;
    // The panel itself owns the aliases, so portals remain compatible with context.
    expect(originalPanel).not.toBeNull();
    expect(originalPanel.style.getPropertyValue('--category-text')).toBe('');
    const originalClass = originalPanel.className;
    rerender(<PublicCategoryThemeProvider styles={styles}><Modal {...{ [prop]: item }} open onClose={() => {}} /></PublicCategoryThemeProvider>);
    const themedPanel = screen.getByRole('heading', { name: 'Fixture title' }).closest('.overflow-y-auto') as HTMLElement;
    expect(themedPanel.style.getPropertyValue('--category-panel')).toBe('#FFFFFF');
    expect(themedPanel.style.getPropertyValue('--category-text')).toBe('#0F172A');
    expect(themedPanel.className).toBe(originalClass);
    rerender(<PublicCategoryThemeProvider styles={null}><Modal {...{ [prop]: item }} open onClose={() => {}} /></PublicCategoryThemeProvider>);
    expect((screen.getByRole('heading', { name: 'Fixture title' }).closest('.overflow-y-auto') as HTMLElement).style.getPropertyValue('--category-text')).toBe('');
  });
});

it.each([false, true])('keeps the %s mobile skeleton variant compatible with public categories and dashboard defaults', mobile => {
  const { container, rerender } = render(<HeroSkeleton mobile={mobile} />);
  expect((container.querySelector('.skeleton-card') as HTMLElement).style.background).toBe('var(--category-card,#111111)');
  rerender(<HeroSkeleton mobile={mobile} variant="dashboard" />);
  expect((container.querySelector('.skeleton-card') as HTMLElement).style.background).toBe('var(--skeleton-bg, var(--dash-muted, #2a3830))');
});
