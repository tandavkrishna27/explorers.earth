import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../i18n/resources/en.json';
import { buildListNameMap } from '../utils/listNames';
import type { PublicPageAnalyticsData } from '../api/queries';

vi.mock('recharts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-i18next', async () => {
  // Resolve against the English resources without importing react-i18next (which is mocked here).
  const { createInstance } = await import('i18next');
  const resources = (await import('../../../i18n/resources/en.json')).default;
  const i18n = createInstance();
  await i18n.init({ lng: 'en', resources: { en: { translation: resources } }, interpolation: { escapeValue: false } });
  const t = (key: string, options?: Record<string, unknown>) => String(i18n.t(key, options as never));
  return { useTranslation: () => ({ t }) };
});
vi.mock('../../Favorites/hooks/usePlacesOwner', () => ({
  usePlacesOwner: () => ({ data: { recommendationLists: [{ documentId: 'place-list-1', List_Name: 'Goa trip' }] } }),
}));

import LocationEngagementChart from '../components/charts/LocationEngagementChart';

const MOVIE_LIST = '18e0cca2-1111-4111-8111-111111111111';
const BOOK_LIST = '77aa0000-2222-4222-8222-222222222222';
const UNNAMED_LIST = '99bb0000-3333-4333-8333-333333333333';
const ts = '2026-08-24T10:00:00.000Z';

const records: PublicPageAnalyticsData[] = [
  { Account_Id: 'a', Location_Id: 'place-list-1', Recommendation_Id: null, Stats: [{ type: 'view', timestamp: ts, page: 'public-home', canonicalPath: '/u/places' }] },
  {
    Account_Id: 'a', Location_Id: MOVIE_LIST, Recommendation_Id: null,
    Stats: [
      { type: 'view', timestamp: ts, page: 'public-movies', canonicalPath: '/u/movies/weekend' },
      { type: 'click', timestamp: ts, page: 'public-movies', element: 'movie-card', canonicalPath: '/u/movies/weekend', metadata: { listName: 'Weekend watchlist' } },
    ],
  },
  { Account_Id: 'a', Location_Id: BOOK_LIST, Recommendation_Id: null, Stats: [{ type: 'view', timestamp: ts, page: 'public-books', canonicalPath: '/u/books/classics', metadata: { listName: 'Classics' } }] },
  { Account_Id: 'a', Location_Id: UNNAMED_LIST, Recommendation_Id: null, Stats: [{ type: 'view', timestamp: ts, page: 'public-games', canonicalPath: '/u/games/x' }] },
];

describe('list names in the owner charts', () => {
  it('resolves names from click metadata and prefers known names', () => {
    const names = buildListNameMap(records, new Map([['place-list-1', 'Goa trip']]));
    expect(names.get(MOVIE_LIST)).toBe('Weekend watchlist');
    expect(names.get(BOOK_LIST)).toBe('Classics');
    expect(names.get('place-list-1')).toBe('Goa trip');
    expect(names.has(UNNAMED_LIST)).toBe(false);
  });

  it('labels every list by name, never by its id', () => {
    const { container } = render(<LocationEngagementChart rawAnalyticsData={records} />);
    fireEvent.click(screen.getByRole('button', { name: /All Locations/ }));

    expect(screen.getByRole('button', { name: /Goa trip/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Weekend watchlist/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Classics/ })).toBeInTheDocument();
    // A list with no known name falls back to the translated "Untitled list".
    expect(screen.getByRole('button', { name: /Untitled list/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Location [0-9a-f]{8}/i);
    expect(container.textContent).not.toContain('18e0cca2');
  });

  it('ships the Untitled list string', () => {
    expect(en.analytics.dashboard.untitledList).toBe('Untitled list');
  });
});
